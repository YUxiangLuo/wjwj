import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./admin.css";
import { AdminApp } from "./AdminApp";

const elem = document.getElementById("root")!;
const app = (
    <StrictMode>
        <AdminApp />
    </StrictMode>
);

if (import.meta.hot) {
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
} else {
    createRoot(elem).render(app);
}
