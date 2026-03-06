import { copyFile, mkdir, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const storageRoot = resolve(process.cwd(), "storage");

function normalizeStorageRelativePath(filePath: string) {
    const normalized = filePath.replace(/\\/g, "/").trim().replace(/^\/+/, "");
    return normalized.startsWith("storage/") ? normalized.slice("storage/".length) : normalized;
}

export function resolveStoragePath(filePath: string) {
    const relativePath = normalizeStorageRelativePath(filePath);
    const fullPath = resolve(storageRoot, relativePath);

    const isInsideStorage = fullPath === storageRoot || fullPath.startsWith(`${storageRoot}${sep}`);
    if (!isInsideStorage) {
        throw new Error("INVALID_PATH");
    }

    return fullPath;
}

export function createStorageUploadPath(fileName: string, folder = "uploads") {
    const uniquePrefix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    return `/storage/${folder}/${uniquePrefix}_${fileName}`;
}

export async function writeStorageFile(storagePath: string, data: string | ArrayBuffer | ArrayBufferView | Blob) {
    const fullPath = resolveStoragePath(storagePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await Bun.write(fullPath, data as Blob | string | ArrayBufferLike);
    return fullPath;
}

export async function copyStorageFile(sourcePath: string, targetPath: string) {
    const sourceFullPath = resolveStoragePath(sourcePath);
    const targetFullPath = resolveStoragePath(targetPath);
    await mkdir(dirname(targetFullPath), { recursive: true });
    await copyFile(sourceFullPath, targetFullPath);
    return targetFullPath;
}

export async function deleteStorageFileIfExists(storagePath: string) {
    try {
        await unlink(resolveStoragePath(storagePath));
    } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
            throw error;
        }
    }
}
