const DEFAULT_PASSWORD_CONCURRENCY = 4;
const DEFAULT_PASSWORD_QUEUE_LIMIT = 32;

export class PasswordWorkQueueFullError extends Error {
    constructor() {
        super("密码服务繁忙，请稍后重试");
        this.name = "PasswordWorkQueueFullError";
    }
}

export class BoundedWorkQueue {
    private active = 0;
    private readonly waiters: Array<() => void> = [];

    constructor(
        readonly concurrency: number,
        readonly queueLimit: number,
    ) {}

    async run<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= this.concurrency) {
            if (this.waiters.length >= this.queueLimit) throw new PasswordWorkQueueFullError();
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
        this.active += 1;
        try {
            return await operation();
        } finally {
            this.active -= 1;
            this.waiters.shift()?.();
        }
    }

    snapshot() {
        return { active: this.active, queued: this.waiters.length };
    }
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number) {
    const value = Number(raw);
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

const passwordQueue = new BoundedWorkQueue(
    boundedInteger(process.env.PASSWORD_WORK_CONCURRENCY, DEFAULT_PASSWORD_CONCURRENCY, 2, 4),
    boundedInteger(process.env.PASSWORD_WORK_QUEUE_LIMIT, DEFAULT_PASSWORD_QUEUE_LIMIT, 4, 128),
);

export function hashPassword(password: string) {
    return passwordQueue.run(() => Bun.password.hash(password));
}

export function verifyPassword(password: string, hash: string) {
    return passwordQueue.run(() => Bun.password.verify(password, hash));
}

export async function mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    mapper: (value: T, index: number) => Promise<R>,
) {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), values.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= values.length) return;
            results[index] = await mapper(values[index]!, index);
        }
    }));
    return results;
}
