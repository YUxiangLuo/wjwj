import { expect, test } from "bun:test";
import { classifyAuditReport } from "./audit-dependencies";

test("dependency audit classifier accepts only the documented package/advisory pairs", () => {
    const result = classifyAuditReport({
        "react-router": [{
            id: 1124282,
            url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
            title: "RSC advisory",
            severity: "high",
        }],
        esbuild: [{
            id: 1102341,
            url: "https://github.com/advisories/GHSA-67mh-4wv8-2f99",
            title: "Development server advisory",
            severity: "moderate",
        }],
    });

    expect(result.accepted).toHaveLength(2);
    expect(result.unexpected).toHaveLength(0);
});

test("dependency audit classifier fails new or mismatched findings", () => {
    const result = classifyAuditReport({
        "react-router": [{
            id: 9999999,
            url: "https://example.test/new",
            title: "New finding",
            severity: "high",
        }],
        "production-package": [{
            id: 1102341,
            url: "https://github.com/advisories/GHSA-67mh-4wv8-2f99",
            title: "Known ID on a different package",
            severity: "moderate",
        }],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.unexpected).toHaveLength(2);
});
