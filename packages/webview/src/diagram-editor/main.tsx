import * as React from "react";
import "../svg/canvas.css";
import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";

const container = document.getElementById("root");

if (!container) {
    throw new Error("Missing webview root container.");
}

createRoot(container).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
