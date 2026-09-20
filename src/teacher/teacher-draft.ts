import { createContext, useContext } from "react";

const DRAFT_PREFIX = "wj:teacher-draft";

export const TeacherIdContext = createContext<number | null>(null);

export function useTeacherId() {
    return useContext(TeacherIdContext);
}

function draftKey(teacherId: number | null, scope: string) {
    return Number.isInteger(teacherId) && Number(teacherId) > 0 && scope
        ? `${DRAFT_PREFIX}:${teacherId}:${scope}`
        : null;
}

function storage() {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
}

export function readTeacherDraft<T>(teacherId: number | null, scope: string): T | null {
    const key = draftKey(teacherId, scope);
    const target = storage();
    if (!key || !target) return null;
    try {
        const value = target.getItem(key);
        return value ? JSON.parse(value) as T : null;
    } catch {
        try { target.removeItem(key); } catch { /* Browser storage is optional. */ }
        return null;
    }
}

export function writeTeacherDraft<T>(teacherId: number | null, scope: string, value: T) {
    const key = draftKey(teacherId, scope);
    const target = storage();
    if (!key || !target) return;
    try { target.setItem(key, JSON.stringify(value)); } catch { /* Keep editing if storage is unavailable. */ }
}

export function clearTeacherDraft(teacherId: number | null, scope: string) {
    const key = draftKey(teacherId, scope);
    const target = storage();
    if (!key || !target) return;
    try { target.removeItem(key); } catch { /* Browser storage is optional. */ }
}
