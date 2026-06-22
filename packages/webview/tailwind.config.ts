import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./src/**/*.{ts,tsx}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                canvas: "var(--diagram-canvas)",
                surface: "var(--diagram-surface)",
                line: "var(--diagram-line)",
                accent: "var(--diagram-accent)",
            },
            fontFamily: {
                sans: [
                    "Geist",
                    "Inter",
                    "ui-sans-serif",
                    "system-ui",
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "sans-serif",
                ],
                mono: [
                    "Geist Mono",
                    "JetBrains Mono",
                    "IBM Plex Mono",
                    "ui-monospace",
                    "SFMono-Regular",
                    "Menlo",
                    "monospace",
                ],
            },
        },
    },
    plugins: [],
};

export default config;
