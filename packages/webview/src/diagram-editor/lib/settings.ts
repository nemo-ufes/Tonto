import * as React from "react";

export type DiagramAccent = "teal" | "amber" | "crimson" | "indigo" | "violet";
export type DiagramDensity = "cozy" | "compact";
export type DiagramCorners = "sharp" | "soft" | "round";
export type DiagramEdgeRouting = "step" | "curved";

export type DiagramSettings = {
    accent: DiagramAccent;
    density: DiagramDensity;
    corners: DiagramCorners;
    edgeRouting: DiagramEdgeRouting;
    minorGrid: boolean;
    vignette: boolean;
};

export const DEFAULT_SETTINGS: DiagramSettings = {
    accent: "teal",
    density: "cozy",
    corners: "soft",
    edgeRouting: "step",
    minorGrid: true,
    vignette: true,
};

const STORAGE_KEY = "tonto-diagram-settings";

type AccentSpec = { light: string; dark: string; lightSoft: string; darkSoft: string };
const ACCENTS: Record<DiagramAccent, AccentSpec> = {
    teal:    { light: "#1F5C5C", dark: "#5FCAB8", lightSoft: "rgba(31,92,92,0.10)",    darkSoft: "rgba(95,202,184,0.14)" },
    amber:   { light: "#A36510", dark: "#E0A85F", lightSoft: "rgba(163,101,16,0.10)",  darkSoft: "rgba(224,168,95,0.14)" },
    crimson: { light: "#8B2A2A", dark: "#E27272", lightSoft: "rgba(139,42,42,0.10)",   darkSoft: "rgba(226,114,114,0.14)" },
    indigo:  { light: "#3D4A8F", dark: "#8B9BE0", lightSoft: "rgba(61,74,143,0.10)",   darkSoft: "rgba(139,155,224,0.14)" },
    violet:  { light: "#5B3A7E", dark: "#B196D5", lightSoft: "rgba(91,58,126,0.10)",   darkSoft: "rgba(177,150,213,0.14)" },
};

const CORNERS: Record<DiagramCorners, { r: string; rs: string }> = {
    sharp: { r: "0",    rs: "0" },
    soft:  { r: "4px",  rs: "3px" },
    round: { r: "10px", rs: "8px" },
};

export function accentSwatchColor(accent: DiagramAccent, isDark: boolean): string {
    const spec = ACCENTS[accent];
    return isDark ? spec.dark : spec.light;
}

export function applySettings(settings: DiagramSettings): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    const corners = CORNERS[settings.corners];
    root.style.setProperty("--radius", corners.r);
    root.style.setProperty("--radius-sm", corners.rs);

    const accent = ACCENTS[settings.accent];
    const isDark = root.classList.contains("dark");
    root.style.setProperty("--accent", isDark ? accent.dark : accent.light);
    root.style.setProperty("--accent-2", isDark ? accent.dark : accent.light);
    root.style.setProperty("--accent-soft", isDark ? accent.darkSoft : accent.lightSoft);
}

function loadSettings(): DiagramSettings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
        const raw = window.localStorage?.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<DiagramSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export function useDiagramSettings(theme: "light" | "dark") {
    const [settings, setSettings] = React.useState<DiagramSettings>(loadSettings);

    React.useEffect(() => {
        applySettings(settings);
        try {
            window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // ignore storage errors
        }
    }, [settings, theme]);

    const patch = React.useCallback((next: Partial<DiagramSettings>) => {
        setSettings((prev) => ({ ...prev, ...next }));
    }, []);

    return { settings, patchSettings: patch };
}
