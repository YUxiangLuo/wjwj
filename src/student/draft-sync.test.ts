import { describe, expect, test } from "bun:test";
import { decideDraftRestore, decideReconnectSync, hasUnsavedChanges } from "./draft-sync";

describe("decideDraftRestore", () => {
    const parseDraft = (raw: string) => {
        try {
            return JSON.parse(raw) as { title?: string };
        } catch {
            return null;
        }
    };

    test("ignores empty or invalid drafts", () => {
        expect(decideDraftRestore({
            rawDraft: null,
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({ type: "none", draft: null });

        expect(decideDraftRestore({
            rawDraft: "{invalid}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({ type: "none", draft: null });
    });

    test("does not prompt when local and server snapshots match", () => {
        expect(decideDraftRestore({
            rawDraft: "{\"title\":\"same\"}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"same\"}",
        })).toEqual({ type: "none", draft: null });
    });

    test("prompts when a meaningful local draft differs from server", () => {
        expect(decideDraftRestore({
            rawDraft: "{\"title\":\"local\"}",
            parseDraft,
            isMeaningfulDraft: (draft) => Boolean(draft.title),
            serverSnapshot: "{\"title\":\"server\"}",
        })).toEqual({
            type: "restore",
            draft: { title: "local" },
        });
    });
});

describe("decideReconnectSync", () => {
    test("prefers no-op when local and server are already aligned", () => {
        expect(decideReconnectSync({
            localSnapshot: "same",
            serverSnapshot: "same",
            lastSyncedSnapshot: "old",
        })).toBe("synced");
    });

    test("detects divergent local and server changes", () => {
        expect(decideReconnectSync({
            localSnapshot: "local",
            serverSnapshot: "server",
            lastSyncedSnapshot: "old",
        })).toBe("conflict");
    });

    test("pushes local changes when only local changed", () => {
        expect(decideReconnectSync({
            localSnapshot: "local",
            serverSnapshot: "old",
            lastSyncedSnapshot: "old",
        })).toBe("push_local");
    });

    test("pulls server changes when local stayed at last synced snapshot", () => {
        expect(decideReconnectSync({
            localSnapshot: "old",
            serverSnapshot: "server",
            lastSyncedSnapshot: "old",
        })).toBe("pull_server");
    });
});

test("hasUnsavedChanges compares current and last synced snapshots", () => {
    expect(hasUnsavedChanges("current", "server")).toBe(true);
    expect(hasUnsavedChanges("same", "same")).toBe(false);
});
