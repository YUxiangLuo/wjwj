import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "./ui/button";

interface Props { resetKey: string; children: ReactNode }
interface State { failed: boolean; resetKey: string }

export class PageErrorBoundary extends Component<Props, State> {
    override state: State = { failed: false, resetKey: this.props.resetKey };
    private heading = createRef<HTMLHeadingElement>();

    static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
    }
    override componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("Page render failed:", error, info.componentStack);
        this.heading.current?.focus();
    }
    override render() {
        if (!this.state.failed) return this.props.children;
        return (
            <section role="alert" className="m-6 space-y-4 rounded-surface border border-destructive-border bg-card p-6" data-testid="page-error-boundary">
                <h1 ref={this.heading} tabIndex={-1} className="text-section-title font-semibold">此页面暂时无法显示</h1>
                <p className="text-body text-muted-foreground">请重试显示。若仍无法恢复，可重新加载页面或返回首页；已保存的数据不会被清除。</p>
                <div className="flex flex-wrap gap-3">
                    <Button onClick={() => this.setState({ failed: false })}>重试显示</Button>
                    <Button variant="outline" onClick={() => window.location.reload()}>重新加载页面</Button>
                    <Button asChild variant="outline"><Link to="/">返回首页</Link></Button>
                </div>
            </section>
        );
    }
}

/** Reset only failed content on navigation; healthy editors are never keyed/remounted. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
    const location = useLocation();
    return <PageErrorBoundary resetKey={location.pathname + location.search}>{children}</PageErrorBoundary>;
}
