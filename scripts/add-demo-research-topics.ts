import { buildDemoResearchCatalog } from "./demo-research-catalog";

interface Entry { topicId: number; taskIds: number[]; state: "draft" | "published" | "assigned" }
interface Manifest { version: 1; baseUrl: string; teacherId: number; entries: Record<string, Entry> }
interface TopicSummary { id: number; name: string; status: number; hasTasks: boolean }
interface TaskSummary { id: number; topicId: number; classId: number }

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
    return JSON.stringify(value);
}

async function main() {
    const rawBase = process.env.DEMO_BASE_URL;
    const manifestPath = process.env.DEMO_CATALOG_MANIFEST;
    if (!rawBase || !manifestPath) throw new Error("DEMO_BASE_URL and DEMO_CATALOG_MANIFEST are required; this command adds data to that explicit demo server.");
    const base = new URL(rawBase).origin;
    const demoCheck = await fetch(`${base}/api/demo/student-credential`);
    if (!demoCheck.ok || !(await demoCheck.json() as { success?: boolean }).success) throw new Error("The target is not an enabled demo server.");
    let cookie = "";
    async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
        const multipart = body instanceof FormData;
        const response = await fetch(base + path, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(!multipart ? { "Content-Type": "application/json" } : {}) }, ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
        const reply = await response.json() as { success: boolean; data: T; error?: { code?: string; message?: string } };
        if (!response.ok || !reply.success) throw new Error(`${method} ${path}: ${response.status} ${reply.error?.code ?? ""} ${reply.error?.message ?? ""}`);
        if (path === "/api/teacher/login") cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
        return reply.data;
    }
    const login = await request<{ user: { id: number } }>("/api/teacher/login", "POST", { employeeId: process.env.DEMO_TEACHER_ID ?? "T001", password: process.env.DEMO_TEACHER_PASSWORD ?? "T001" });
    try {
        if (!cookie) throw new Error("Login did not issue a session cookie.");
        const classes = await request<Array<{ id: number; name: string }>>("/api/teacher/classes");
        const classNames = ["2026级统计学1班", "2026级公共管理班"];
        const classIds = classNames.map(name => { const row = classes.find(row => row.name === name); if (!row) throw new Error(`Demo class not found or not owned: ${name}`); return row.id; });
        const manifestFile = Bun.file(manifestPath);
        const manifest: Manifest = await manifestFile.exists() ? await manifestFile.json() : { version: 1, baseUrl: base, teacherId: login.user.id, entries: {} };
        if (manifest.version !== 1 || manifest.baseUrl !== base || manifest.teacherId !== login.user.id) throw new Error("Manifest belongs to another target or teacher.");
        const save = () => Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
        const topics = await request<TopicSummary[]>("/api/teacher/topics");
        for (const item of buildDemoResearchCatalog()) {
            let entry = manifest.entries[item.key];
            const previousId = entry?.topicId;
            let existing = previousId ? topics.find(topic => topic.id === previousId) : topics.find(topic => topic.name === item.name);
            if (entry && !existing) throw new Error(`Previously created topic ${item.key} was removed; inspect the manifest before recreating it.`);
            if (!entry && existing) throw new Error(`A topic named ${item.name} already exists outside this manifest; it will not be overwritten.`);
            if (!existing) {
                const created = await request<{ id: number }>("/api/teacher/topics", "POST", { name: item.name, description: item.description });
                entry = { topicId: created.id, taskIds: [], state: "draft" };
                manifest.entries[item.key] = entry;
                existing = { id: created.id, name: item.name, status: 0, hasTasks: false };
                topics.push(existing);
                await save();
            }
            const id = existing.id;
            if (existing.status === 0 && !existing.hasTasks) {
                if (entry!.state !== "draft") throw new Error(`Previously published topic ${item.name} was changed; it will not be overwritten.`);
                const file = new FormData();
                file.append("file", new File([item.csv], `${item.key}-synthetic.csv`, { type: "text/csv" }));
                await request(`/api/teacher/topics/${id}/excel`, "POST", file);
                await request(`/api/teacher/topics/${id}/mapping`, "PUT", { fieldMapping: item.fieldMapping });
                await request(`/api/teacher/topics/${id}/sampling-policy`, "PUT", { samplingPolicy: item.samplingPolicy });
                await request(`/api/teacher/topics/${id}/recommend-questions`, "PUT", { items: item.recommendQuestions });
                await request(`/api/teacher/topics/${id}/weights`, "PUT", { weightConfig: item.weightConfig });
                await request(`/api/teacher/topics/${id}`, "PUT", { name: item.name, description: item.description, status: 1 });
            }
            const detail = await request<{ topic: { name: string; status: number; excelRowCount: number; fieldMapping: unknown; samplingPolicy: unknown; weightConfig: unknown }; recommendQuestions: unknown }>(`/api/teacher/topics/${id}/detail`);
            if (detail.topic.name !== item.name || detail.topic.status !== 1 || detail.topic.excelRowCount !== item.rows.length
                || stable(detail.topic.fieldMapping) !== stable(item.fieldMapping)
                || stable(detail.topic.samplingPolicy) !== stable(item.samplingPolicy)
                || stable(detail.topic.weightConfig) !== stable(item.weightConfig)
                || stable(detail.recommendQuestions) !== stable(item.recommendQuestions)) throw new Error(`Published topic differs from catalog: ${item.key}`);
            entry!.state = "published";
            await save();
            // No deadline: these additional demo tasks stay available for repeated testing.
            await request("/api/teacher/tasks", "POST", { topicId: id, classIds });
            const tasks = (await request<TaskSummary[]>("/api/teacher/tasks")).filter(task => task.topicId === id && classIds.includes(task.classId));
            if (tasks.length !== classIds.length || new Set(tasks.map(task => task.classId)).size !== classIds.length) throw new Error(`Unexpected task assignments for ${item.key}`);
            entry!.taskIds = tasks.map(task => task.id).sort((a, b) => a - b);
            entry!.state = "assigned";
            await save();
            console.log(`${item.name}: topic=${id}, rows=${item.rows.length}, tasks=${entry!.taskIds.join(",")}`);
        }
        console.log(`Catalog ready: ${Object.keys(manifest.entries).length} topics, ${classNames.join(" / ")}`);
    } finally {
        if (cookie) await request("/api/teacher/logout", "POST", {}).catch(() => undefined);
    }
}
if (import.meta.main) await main();
