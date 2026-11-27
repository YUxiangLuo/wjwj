import { afterEach, expect, mock, test } from "bun:test";
import { MemoryRouter } from "react-router-dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrap = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrap.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals> | null = null;

afterEach(async () => {
    await act(async () => cleanup());
    await Bun.sleep(0);
    globalThis.fetch = originalFetch;
    dom?.restore();
    dom = null;
});

test("Dashboard renders clean MD3 KPIs, divided announcement rows before analytics, error retry, and zero axe violations", async () => {
    dom = installDomGlobals("http://localhost/");
    let failNext = true;

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/admin/stats")) {
            if (failNext) {
                return Response.json(
                    { success: false, error: { code: "UNAVAILABLE", message: "模拟首页加载失败" } },
                    { status: 503 },
                );
            }
            return Response.json({
                success: true,
                data: {
                    currentSemester: "2026-2027-1",
                    teacherCount: 6,
                    classCount: 12,
                    studentCount: 360,
                    pendingItems: 4,
                    semesterCount: 3,
                    publishedAnnouncementCount: 2,
                    draftAnnouncementCount: 1,
                },
            });
        }
        if (url.includes("/api/admin/announcements")) {
            return Response.json({
                success: true,
                data: [
                    {
                        id: 1,
                        title: "秋季实训开放通知",
                        content: "<p>请各班按计划开展抽样调查。</p>",
                        targetScope: "all",
                        status: 1,
                        createdAt: "2026-09-10T08:00:00.000Z",
                        updatedAt: "2026-09-10T08:00:00.000Z",
                    },
                    {
                        id: 2,
                        title: "草稿通知",
                        content: "<p>未发布草稿</p>",
                        targetScope: "teacher",
                        status: 0,
                        createdAt: "2026-09-11T08:00:00.000Z",
                        updatedAt: "2026-09-11T08:00:00.000Z",
                    },
                ],
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { Dashboard } = await import("./Dashboard");
    const view = render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>,
    );

    const alert = await view.findByRole("alert");
    expect(alert.textContent).toContain("模拟首页加载失败");

    failNext = false;
    fireEvent.click(view.getByRole("button", { name: "重新加载" }));

    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
    expect(view.getByTestId("admin-dashboard-stat-semester").textContent).toBe("2026-2027-1");
    expect(view.getByTestId("admin-dashboard-stat-teachers").textContent).toBe("6");
    expect(view.getByTestId("admin-dashboard-stat-classes").textContent).toBe("12");
    expect(view.getByTestId("admin-dashboard-stat-students").textContent).toBe("360");

    const kpiSection = view.getByRole("region", { name: "管理概览" });
    expect(kpiSection.className).not.toContain("bg-info-muted");
    expect(kpiSection.className).not.toContain("bg-auxiliary-muted");
    expect(kpiSection.className).not.toContain("bg-success-muted");

    const announcementsPanel = view.getByTestId("admin-dashboard-announcements");
    expect(announcementsPanel.querySelectorAll("article").length).toBe(1);
    expect(announcementsPanel.textContent).toContain("秋季实训开放通知");
    expect(announcementsPanel.textContent).not.toContain("草稿通知");

    const analyticsPanel = view.getByTestId("admin-dashboard-analytics");
    expect(
        Boolean(announcementsPanel.compareDocumentPosition(analyticsPanel) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    expect(await getAccessibilityViolations(view.container)).toEqual([]);
});

test("ClassManagement empty search state renders a single-cell table row and passes axe checks", async () => {
    dom = installDomGlobals("http://localhost/");
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/semesters")) {
            return Response.json({
                success: true,
                data: [{ id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }],
            });
        }
        if (url.includes("/teachers")) {
            return Response.json({
                success: true,
                data: [{ id: 1, employeeId: "T001", name: "张岚", classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }],
            });
        }
        return Response.json({
            success: true,
            data: [{
                id: 3,
                name: "2026级商务统计1班",
                semesterId: 1,
                semesterName: "2026-2027-1",
                teacherId: 1,
                teacherName: "张岚",
                studentCount: 10,
                taskCount: 2,
                createdAt: "2026-09-01T00:00:00.000Z",
            }],
        });
    }) as unknown as typeof fetch;

    const { ClassManagement } = await import("./ClassManagement");
    const view = render(
        <MemoryRouter>
            <ClassManagement />
        </MemoryRouter>,
    );

    await view.findByText("2026级商务统计1班");
    fireEvent.change(view.getByTestId("class-search-input"), { target: { value: "不存在的专项测试记录" } });

    await waitFor(() => {
        const cells = view.container.querySelectorAll('table[aria-label="班级列表"] tbody tr td');
        expect(cells.length).toBe(1);
    });

    expect(await getAccessibilityViolations(view.container)).toEqual([]);
});
