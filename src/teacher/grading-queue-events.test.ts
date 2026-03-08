import { expect, test } from "bun:test";

import { didPendingGradingCountChange } from "./grading-queue-events";

test("didPendingGradingCountChange only reacts to pending membership transitions", () => {
    expect(didPendingGradingCountChange(1, 0)).toBe(true);
    expect(didPendingGradingCountChange(1, 2)).toBe(true);
    expect(didPendingGradingCountChange(1, 3)).toBe(true);
    expect(didPendingGradingCountChange(0, 1)).toBe(true);

    expect(didPendingGradingCountChange(0, 0)).toBe(false);
    expect(didPendingGradingCountChange(0, 2)).toBe(false);
    expect(didPendingGradingCountChange(2, 3)).toBe(false);
    expect(didPendingGradingCountChange(null, 2)).toBe(false);
});
