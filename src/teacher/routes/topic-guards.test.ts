import { expect, test } from "bun:test";
import { hasTopicOwnership } from "./topic-guards";

test("topic ownership check denies cross-teacher access", async () => {
    const allowed = await hasTopicOwnership(10, 3, async () => null);
    expect(allowed).toBe(false);
});

test("topic ownership check allows owner access", async () => {
    const allowed = await hasTopicOwnership(10, 3, async () => ({ id: 10 }));
    expect(allowed).toBe(true);
});
