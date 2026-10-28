import { link, mkdir, open, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Publish complete bytes without replacing an existing versioned file. */
export async function ensureImmutableFile(target: string, bytes: Uint8Array) {
    const hash = (value: Uint8Array | ArrayBuffer) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
    const expectedHash = hash(bytes);
    const matchesExisting = async () => {
        try {
            const existing = await Bun.file(target).arrayBuffer();
            if (hash(existing) !== expectedHash) throw new Error("目标版本文件已存在且内容不同，请使用新版本路径");
            return true;
        } catch (cause) {
            if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return false;
            throw cause;
        }
    };
    if (await matchesExisting()) return;

    await mkdir(dirname(target), { recursive: true });
    const temporary = join(dirname(target), `.${basename(target)}.${crypto.randomUUID()}.tmp`);
    const handle = await open(temporary, "wx");
    try {
        await handle.writeFile(bytes);
        await handle.sync();
        // A same-directory hard link publishes the complete file atomically and
        // fails if the target exists. rename() would overwrite another version.
        try { await link(temporary, target); }
        catch (cause) {
            if (!cause || typeof cause !== "object" || !("code" in cause) || cause.code !== "EEXIST") throw cause;
            if (!await matchesExisting()) throw cause;
        }
    } finally {
        try { await handle.close(); }
        finally { await unlink(temporary); }
    }
}
