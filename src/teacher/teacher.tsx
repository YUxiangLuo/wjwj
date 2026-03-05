import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TeacherApp } from "./TeacherApp";

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <BrowserRouter basename="/teacher">
            <ThemeProvider>
                <TeacherApp />
            </ThemeProvider>
        </BrowserRouter>
    </StrictMode>
);

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    createRoot(elem).render(app);
}
