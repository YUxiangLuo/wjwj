import { expect, test } from "bun:test";

import { createLatestRequestGate } from "./latest-request-gate";

test("latest request gate only keeps the newest request current", () => {
    const gate = createLatestRequestGate();

    const first = gate.start();
    const second = gate.start();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
});

test("latest request gate invalidates the current request", () => {
    const gate = createLatestRequestGate();

    const requestId = gate.start();
    expect(gate.isCurrent(requestId)).toBe(true);

    gate.invalidate();

    expect(gate.isCurrent(requestId)).toBe(false);
});
