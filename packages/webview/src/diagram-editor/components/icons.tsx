import * as React from "react";
import type { TontoDiagramDirection } from "tonto-cli";

type IconProps = { size?: number };

export function GearIcon({ size = 14 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

export function SunIcon({ size = 13 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    );
}

export function MoonIcon({ size = 13 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}

export function CloseIcon({ size = 14 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    );
}

type LayoutIconProps = { dir: TontoDiagramDirection; size?: number };
export function LayoutIcon({ dir, size = 14 }: LayoutIconProps) {
    const inner: Record<TontoDiagramDirection, React.ReactNode> = {
        TB: <><rect x="4" y="2" width="6" height="3" /><rect x="4" y="9" width="6" height="3" /><path d="M7 5v4" /></>,
        BT: <><rect x="4" y="2" width="6" height="3" /><rect x="4" y="9" width="6" height="3" /><path d="M7 9V5" /></>,
        LR: <><rect x="1" y="4" width="3" height="6" /><rect x="8" y="4" width="3" height="6" /><path d="M4 7h4" /></>,
        RL: <><rect x="1" y="4" width="3" height="6" /><rect x="8" y="4" width="3" height="6" /><path d="M8 7H4" /></>,
    };
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="currentColor" stroke="currentColor"
            strokeWidth="0.8" strokeLinejoin="miter" aria-hidden="true">
            {inner[dir]}
        </svg>
    );
}
