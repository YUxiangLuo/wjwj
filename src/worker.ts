import { startBackgroundJobs } from "./server/background-jobs";

const stop = startBackgroundJobs();

console.log("Background worker running");

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        stop();
        process.exit(0);
    });
}
