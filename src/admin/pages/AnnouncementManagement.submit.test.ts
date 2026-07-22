import { expect, mock, test } from "bun:test";
import { createAnnouncementSubmitGuard } from "./AnnouncementManagement";

test("announcement submit guard starts only one create for synchronous double triggers", async () => {
    let resolveCreate!: (value: { success: true; data: { id: number } }) => void;
    const create = mock(() => new Promise<{ success: true; data: { id: number } }>((resolve) => {
        resolveCreate = resolve;
    }));
    const submittingChanges: boolean[] = [];
    const guard = createAnnouncementSubmitGuard((submitting) => submittingChanges.push(submitting));

    const first = guard.run(create);
    const second = await guard.run(create);

    expect(second).toEqual({ started: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(guard.isSubmitting()).toBe(true);

    resolveCreate({ success: true, data: { id: 12 } });
    expect(await first).toEqual({ started: true, value: { success: true, data: { id: 12 } } });
    expect(guard.isSubmitting()).toBe(false);
    expect(submittingChanges).toEqual([true, false]);
});
