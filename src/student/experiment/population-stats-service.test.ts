import { expect, test } from "bun:test";
import { PopulationStatsService } from "./population-stats-service";
import { runPopulationStatsJob } from "./population-stats-job";
import type { ServiceWorker } from "../../server/worker-service";

test("50 readers share statistics; cache invalidates for file, mapping and deletion", async () => {
    const path = `/storage/test-shared-stats-${crypto.randomUUID()}.csv`;
    const file = Bun.file(`${process.cwd()}${path}`);
    await Bun.write(file, "id,group,score,size\n1,A,2,1\n2,A,4,2\n3,B,8,3\n4,B,10,4\n");
    let workerJobs = 0;
    const service = new PopulationStatsService({ createWorker: () => {
        const worker = new Worker(new URL("./population-stats-worker.ts", import.meta.url).href) as ServiceWorker;
        const send = worker.postMessage.bind(worker);
        worker.postMessage = (message: unknown) => { workerJobs += 1; send(message); };
        return worker;
    } });
    const job = { populationPath: path, fieldMapping: { numeric: ["score", "size"], stratified: ["group"] } };
    try {
        const expected = await runPopulationStatsJob(job);
        if (!expected.ok) throw Error(expected.message);
        const results = await Promise.all(Array.from({ length: 50 }, () => service.run(job)));
        expect(workerJobs).toBe(1);
        for (const result of results) expect(result).toEqual(expected.data);
        expect((await service.run(job)).populationNumericStats.score!.mean).toBe(6);
        expect(workerJobs).toBe(1);
        const remapped = await service.run({ ...job, fieldMapping: { numeric: ["size"] } });
        expect(remapped.numericFields).toEqual(["size"]);
        expect(remapped.stats).toEqual({});
        expect(workerJobs).toBe(2);
        await Bun.write(file, "id,group,score,size\n1,A,12,1\n2,A,14,2\n3,B,18,3\n4,B,20,4\n");
        expect((await service.run(job)).populationNumericStats.score!.mean).toBe(16);
        expect(workerJobs).toBe(3);
        await file.delete();
        await expect(service.run(job)).rejects.toMatchObject({ code: "READ_FAILED" });
        service.close();
        await expect(service.run(job)).rejects.toMatchObject({ code: "STATS_CLOSED" });
    } finally { service.close(); await file.delete().catch(() => undefined); }
});
