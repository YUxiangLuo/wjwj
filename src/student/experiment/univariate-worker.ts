import { runUnivariateJob, type UnivariateJob } from "./univariate-job";
import type { WorkerReply } from "../../server/worker-service";

declare const self: Worker;
self.onmessage = async ({ data }: MessageEvent<{ id: number; job: UnivariateJob }>) => {
    self.postMessage({ id: data.id, result: await runUnivariateJob(data.job) } satisfies WorkerReply<unknown>);
};
