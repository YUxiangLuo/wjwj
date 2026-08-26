import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { reloadBfcachePage } from "@/lib/bfcache";
import "./teacher.css";
import { TeacherApp } from "./TeacherApp";

window.addEventListener("pageshow", reloadBfcachePage);

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <BrowserRouter basename="/teacher">
            <TeacherApp />
        </BrowserRouter>
    </StrictMode>
);

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    createRoot(elem).render(app);
}
