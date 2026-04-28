import { expect, test } from "bun:test";
import { WEIGHT_SEGMENTS } from "../components/TopicViewDialog";
import { STATUS_KEYS, STATUS_VISUALS } from "./TaskProgressDetail";

function expectUnique(values: string[]) {
    expect(new Set(values).size).toBe(values.length);
}

test("task progress status chart colors are visually distinct", () => {
    expectUnique(STATUS_KEYS.map((key) => STATUS_VISUALS[key].barClass));
    expectUnique(STATUS_KEYS.map((key) => STATUS_VISUALS[key].ringColor));
});

test("topic weight chart colors are visually distinct", () => {
    expectUnique(WEIGHT_SEGMENTS.map((segment) => segment.barClass));
});
