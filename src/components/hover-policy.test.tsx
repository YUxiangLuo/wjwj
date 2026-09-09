import { expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { Table, TableBody, TableCell, TableRow } from "./ui/table";

const source = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();
const staticPages = [
    "admin/pages/ClassManagement.tsx", "admin/pages/SemesterManagement.tsx",
    "teacher/pages/ClassManagement.tsx", "teacher/pages/StudentManagement.tsx",
    "teacher/pages/TopicManagement.tsx", "teacher/pages/TaskManagement.tsx",
    "teacher/pages/GradeExport.tsx", "teacher/pages/TaskProgressDetail.tsx",
];

test("table rows are static by default; selection and explicit reading highlights remain available", async () => {
    const dom = installDomGlobals();
    try {
        const view = render(<Table><TableBody>
            <TableRow data-testid="static"><TableCell>空态</TableCell></TableRow>
            <TableRow data-testid="selected" data-state="selected"><TableCell>已选</TableCell></TableRow>
            <TableRow data-testid="tracking" className="hover:bg-muted"><TableCell>阅读定位</TableCell></TableRow>
        </TableBody></Table>);
        expect(view.getByTestId("static").className).not.toContain("hover:");
        expect(view.getByTestId("selected").className).toContain("data-[state=selected]:bg-muted");
        expect(view.getByTestId("tracking").className).toContain("hover:bg-muted");
    } finally { await act(async () => cleanup()); dom.restore(); }
});

for (const path of staticPages) {
    test(`${path}: static statistics and table headers do not suggest actions`, async () => {
        const text = await source(path);
        for (const card of text.matchAll(/<Card\b[^\n]*>/g)) expect(card[0]).not.toContain("hover:");
        for (const header of text.matchAll(/<TableHeader\b[\s\S]*?<\/TableHeader>/g)) expect(header[0]).not.toContain("hover:");
    });
}

test("content containers keep their background while inner controls remain interactive", async () => {
    const topic = await source("teacher/pages/TopicManagement.tsx");
    const questionnaire = await source("student/pages/stages/QuestionnaireDesign.tsx");
    expect(topic.match(/<div data-testid=\{`teacher-topic-row-[^\n]+/)?.[0]).not.toContain("hover:");
    expect(questionnaire.match(/<div key=\{rq.id\}[^\n]+/)?.[0]).not.toContain("hover:");
});

for (const path of ["components/questionnaire/QuestionEditor.tsx", "student/pages/SubmissionPreview.tsx"]) {
    test(`${path}: filled active tabs cannot inherit inactive hover text`, async () => {
        const text = await source(path);
        const lines = text.split("\n").filter(line => line.includes("data-[state=active]:text-primary-foreground"));
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line).toContain("data-[state=inactive]:hover:text-foreground");
            expect(line).not.toMatch(/\shover:text-foreground/);
        }
    });
}

test("custom semantic outline buttons define matching hover text and border", async () => {
    const text = await source("student/components/StratifiedSamplingTab.tsx");
    const warning = text.split("\n").filter(line => line.includes("hover:bg-warning-muted"));
    expect(warning.length).toBe(3);
    for (const line of warning) {
        expect(line).toContain("hover:text-warning");
        expect(line).toContain("hover:border-warning");
    }
    const auxiliary = text.split("\n").find(line => line.includes("hover:bg-auxiliary-muted"))!;
    expect(auxiliary).toContain("hover:text-auxiliary-strong");
    expect(auxiliary).toContain("hover:border-auxiliary-border");
});

test("teacher status actions keep destructive and success hover semantics", async () => {
    const text = await source("admin/pages/TeacherManagement.tsx");
    expect(text).toContain("text-destructive hover:bg-destructive-muted hover:text-destructive");
    expect(text).toContain("text-success hover:bg-success-muted hover:text-success");
});

test("related custom outline actions do not fall back to primary hover", async () => {
    for (const [path, classes] of [
        ["student/components/immersive-sample-planning/phases/DecisionPhase.tsx", "hover:bg-warning-muted hover:text-warning hover:border-warning"],
        ["teacher/pages/GradingDetail.tsx", "hover:bg-info-muted hover:text-info hover:border-info-border"],
        ["student/components/StratifiedAllocationComparison.tsx", "hover:bg-auxiliary-muted hover:text-foreground hover:border-auxiliary-border"],
    ]) expect(await source(path!)).toContain(classes!);
});
