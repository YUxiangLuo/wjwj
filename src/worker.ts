import { startBackgroundJobs } from "./server/background-jobs";
import { registerLongRunningProcessSignals } from "./server/process-signals";

const stop = startBackgroundJobs();

console.log("Background worker running");

registerLongRunningProcessSignals({
    onShutdown: () => {
        stop();
    },
});
