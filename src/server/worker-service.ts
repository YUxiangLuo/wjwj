export type ServiceWorker = Worker & { ref(): void; unref(): void };
export type WorkerResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
export interface WorkerReply<T> { id: number; result: WorkerResult<T> }

export class WorkerServiceError extends Error {
    constructor(public readonly code: string, message: string, public readonly status = 503) {
        super(message);
        this.name = "WorkerServiceError";
    }
}

export function queueLimitFromEnv(raw: string | undefined, fallback: number) {
    const value = Number(raw);
    return Number.isInteger(value) && value >= 1 && value <= 256 ? value : fallback;
}

interface Subscriber<T> { finish(error: Error | null, value?: T): void }
interface PendingJob<J, T> {
    id: number;
    job: J;
    key?: string;
    deadline: number;
    subscribers: Set<Subscriber<T>>;
    timer: ReturnType<typeof setTimeout>;
}

/** One persistent CPU worker per service, with bounded admission and deadlines.
 * Optional keys share in-flight work; cancellation belongs to each caller.
 */
export class WorkerService<J, T> {
    private worker: ServiceWorker | null = null;
    private active: PendingJob<J, T> | null = null;
    private queue: PendingJob<J, T>[] = [];
    private readonly keyed = new Map<string, PendingJob<J, T>>();
    private nextId = 1;
    private subscribers = 0;
    private closed = false;

    constructor(private readonly options: {
        createWorker: () => ServiceWorker;
        queueLimit: number;
        timeoutMs: number;
        code: string;
        label: string;
    }) {}

    private failure(suffix: string, message: string) {
        return new WorkerServiceError(`${this.options.code}_${suffix}`, `${this.options.label}${message}`);
    }

    run(job: J, options: { key?: string; signal?: AbortSignal } = {}): Promise<T> {
        if (options.signal?.aborted) return Promise.reject(new DOMException("请求已取消", "AbortError"));
        if (this.closed) return Promise.reject(this.failure("CLOSED", "服务正在停止，请稍后重试"));
        const shared = options.key ? this.keyed.get(options.key) : undefined;
        if (this.subscribers >= 512 || (!shared && this.active && this.queue.length >= this.options.queueLimit)) {
            return Promise.reject(this.failure("BUSY", "任务较多，请稍后重试"));
        }
        return new Promise((resolve, reject) => {
            const pending: PendingJob<J, T> = shared ?? {
                id: this.nextId++, job, key: options.key,
                deadline: Date.now() + this.options.timeoutMs,
                subscribers: new Set<Subscriber<T>>(),
                timer: setTimeout(() => this.expire(pending), this.options.timeoutMs),
            };
            this.subscribers += 1;
            const onAbort = () => {
                subscriber.finish(new DOMException("请求已取消", "AbortError"));
                if (!pending.subscribers.size && pending !== this.active) {
                    this.queue = this.queue.filter((item) => item !== pending);
                    this.forget(pending);
                }
            };
            const subscriber: Subscriber<T> = {
                finish: (error, value) => {
                    if (!pending.subscribers.delete(subscriber)) return;
                    this.subscribers -= 1;
                    options.signal?.removeEventListener("abort", onAbort);
                    if (error) reject(error);
                    else resolve(value as T);
                },
            };
            pending.subscribers.add(subscriber);
            options.signal?.addEventListener("abort", onAbort, { once: true });
            if (!shared) {
                if (pending.key) this.keyed.set(pending.key, pending);
                this.queue.push(pending);
            }
            this.dispatch();
        });
    }

    private forget(job: PendingJob<J, T>) {
        clearTimeout(job.timer);
        if (job.key && this.keyed.get(job.key) === job) this.keyed.delete(job.key);
    }

    private settle(job: PendingJob<J, T>, error: Error | null, data?: T) {
        this.forget(job);
        for (const subscriber of job.subscribers) subscriber.finish(error, data);
    }

    close() {
        this.closed = true;
        this.retireWorker();
        const jobs = this.active ? [this.active, ...this.queue] : this.queue;
        this.active = null;
        this.queue = [];
        for (const job of jobs) this.settle(job, this.failure("CLOSED", "服务正在停止，请稍后重试"));
    }

    private retireWorker() {
        const worker = this.worker;
        this.worker = null;
        worker?.terminate();
    }

    private expire(job: PendingJob<J, T>) {
        if (this.active === job) {
            this.retireWorker();
            this.active = null;
        } else {
            this.queue = this.queue.filter((pending) => pending !== job);
        }
        this.settle(job, this.failure("TIMEOUT", "等待或计算超时，请稍后重试"));
        this.dispatch();
    }

    private workerFailed(worker: ServiceWorker) {
        if (this.worker !== worker) return;
        this.retireWorker();
        if (this.active) {
            this.settle(this.active, this.failure("FAILED", "计算中断，请重试"));
            this.active = null;
        }
        this.dispatch();
    }

    private dispatch() {
        if (this.closed || this.active) return;
        let pending = this.queue.shift();
        // Delayed timers must not cause already-expired jobs to start workers.
        while (pending && pending.deadline <= Date.now()) {
            this.settle(pending, this.failure("TIMEOUT", "等待或计算超时，请稍后重试"));
            pending = this.queue.shift();
        }
        if (!pending) { this.worker?.unref(); return; }
        this.active = pending;
        try {
            if (!this.worker) {
                const worker = this.options.createWorker();
                this.worker = worker;
                worker.onmessage = ({ data }: MessageEvent<WorkerReply<T>>) => {
                    if (this.worker !== worker || data.id !== this.active?.id) return;
                    const current = this.active;
                    this.active = null;
                    if (data.result.ok) this.settle(current, null, data.result.data);
                    else this.settle(current, new WorkerServiceError(data.result.code, data.result.message, 500));
                    this.dispatch();
                };
                worker.onerror = (event) => { event.preventDefault(); this.workerFailed(worker); };
                worker.addEventListener("close", () => this.workerFailed(worker));
            }
            this.worker.ref();
            this.worker.postMessage({ id: pending.id, job: pending.job });
        } catch {
            this.retireWorker();
            this.active = null;
            this.settle(pending, this.failure("FAILED", "计算无法启动，请重试"));
            this.dispatch();
        }
    }
}
