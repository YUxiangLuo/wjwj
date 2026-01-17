import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TeacherApp } from "./TeacherApp";

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <TeacherApp />
    </StrictMode>
);

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    createRoot(elem).render(app);
}
