import { expect, mock, test } from "bun:test";
import { reloadBfcachePage } from "./bfcache";

test("bfcache restoration reloads protected SPA state", () => {
    const reload = mock(() => undefined);

    reloadBfcachePage({ persisted: false }, reload);
    expect(reload).not.toHaveBeenCalled();

    reloadBfcachePage({ persisted: true }, reload);
    expect(reload).toHaveBeenCalledTimes(1);
});
