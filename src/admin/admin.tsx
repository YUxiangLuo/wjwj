import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { RouteErrorBoundary } from "@/components/PageErrorBoundary";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./admin.css";
import { AdminApp } from "./AdminApp";

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <MaterialThemeProvider>
            <BrowserRouter basename="/admin">
                <RouteErrorBoundary><AdminApp /></RouteErrorBoundary>
            </BrowserRouter>
        </MaterialThemeProvider>
    </StrictMode>
);

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    createRoot(elem).render(app);
}
