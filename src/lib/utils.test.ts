import { expect, test } from "bun:test";

import { cn } from "./utils";

test("cn treats semantic radius and elevation utilities as Tailwind class groups", () => {
    expect(cn("rounded-surface", "rounded-3xl")).toBe("rounded-3xl");
    expect(cn("rounded-overlay", "rounded-none")).toBe("rounded-none");
    expect(cn("rounded-xl", "rounded-control")).toBe("rounded-control");
    expect(cn("shadow-surface", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-floating", "shadow-2xl")).toBe("shadow-2xl");
    expect(cn("shadow-lg", "shadow-emphasis")).toBe("shadow-emphasis");
});
