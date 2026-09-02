import { expect, test } from "bun:test";

import { cn } from "./utils";

test("cn treats semantic type, radius, and elevation utilities as Tailwind class groups", () => {
    expect(cn("rounded-circle", "rounded-surface")).toBe("rounded-surface");
    expect(cn("rounded-overlay", "rounded-none")).toBe("rounded-none");
    expect(cn("rounded-surface", "rounded-control")).toBe("rounded-control");
    expect(cn("rounded-control", "rounded-toggle")).toBe("rounded-toggle");
    expect(cn("shadow-floating", "shadow-none")).toBe("shadow-none");
    expect(cn("shadow-lg", "shadow-floating")).toBe("shadow-floating");
    expect(cn("text-meta", "text-body")).toBe("text-body");
    expect(cn("text-page-title", "text-label")).toBe("text-label");
});
