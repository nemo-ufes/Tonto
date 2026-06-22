import * as React from "react";
import { cn } from "../utils/cn";
import {
    accentSwatchColor,
    type DiagramAccent,
    type DiagramCorners,
    type DiagramDensity,
    type DiagramEdgeRouting,
    type DiagramSettings,
} from "../lib/settings";
import { CloseIcon, GearIcon, MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark";

type SettingsModalProps = {
    open: boolean;
    onClose: () => void;
    settings: DiagramSettings;
    onChange: (next: Partial<DiagramSettings>) => void;
    theme: Theme;
    onSetTheme: (next: Theme) => void;
};

const ACCENTS: DiagramAccent[] = ["teal", "amber", "crimson", "indigo", "violet"];

export function SettingsModal({ open, onClose, settings, onChange, theme, onSetTheme }: SettingsModalProps) {
    React.useEffect(() => {
        if (!open) return;
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    const isDark = theme === "dark";

    return (
        <div className="tonto-modal-overlay" onClick={onClose} role="presentation">
            <div className="tonto-modal" role="dialog" aria-modal="true" aria-label="Tonto editor configuration"
                onClick={(event) => event.stopPropagation()}>
                <div className="tonto-modal-header">
                    <div className="tonto-modal-title">
                        <GearIcon size={15} />
                        <span>Configuration</span>
                        <span className="label">tonto · editor</span>
                    </div>
                    <button
                        type="button"
                        className="tonto-icon-btn"
                        onClick={onClose}
                        title="Close (Esc)"
                        aria-label="Close"
                    >
                        <CloseIcon size={14} />
                    </button>
                </div>

                <div className="tonto-modal-body">
                    <SettingRow name="Appearance" desc="light / dark color scheme">
                        <Segmented
                            value={theme}
                            options={[
                                { value: "light", label: "Light", icon: <SunIcon size={12} /> },
                                { value: "dark", label: "Dark", icon: <MoonIcon size={12} /> },
                            ]}
                            onChange={(value) => onSetTheme(value)}
                        />
                    </SettingRow>

                    <SettingRow name="Accent color" desc="active tabs, focus rings, primary highlights">
                        <div className="tonto-swatch-row">
                            {ACCENTS.map((accent) => (
                                <button
                                    key={accent}
                                    type="button"
                                    className={cn("tonto-swatch", settings.accent === accent && "on")}
                                    style={{ background: accentSwatchColor(accent, isDark) }}
                                    onClick={() => onChange({ accent })}
                                    title={accent}
                                    aria-label={`Accent ${accent}`}
                                />
                            ))}
                        </div>
                    </SettingRow>

                    <SettingRow name="Density" desc="compact = tighter padding in nodes">
                        <Segmented<DiagramDensity>
                            value={settings.density}
                            options={[
                                { value: "cozy", label: "Cozy" },
                                { value: "compact", label: "Compact" },
                            ]}
                            onChange={(value) => onChange({ density: value })}
                        />
                    </SettingRow>

                    <SettingRow name="Node corners" desc="corner radius applied to nodes & cards">
                        <Segmented<DiagramCorners>
                            value={settings.corners}
                            options={[
                                { value: "sharp", label: "Sharp" },
                                { value: "soft", label: "Soft" },
                                { value: "round", label: "Round" },
                            ]}
                            onChange={(value) => onChange({ corners: value })}
                        />
                    </SettingRow>

                    <SettingRow name="Edge routing" desc="step = orthogonal · curved = bezier">
                        <Segmented<DiagramEdgeRouting>
                            value={settings.edgeRouting}
                            options={[
                                { value: "step", label: "Step" },
                                { value: "curved", label: "Curved" },
                            ]}
                            onChange={(value) => onChange({ edgeRouting: value })}
                        />
                    </SettingRow>

                    <SettingRow name="Minor grid dots" desc="16 px dot grid behind the canvas">
                        <Segmented<"on" | "off">
                            value={settings.minorGrid ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(value) => onChange({ minorGrid: value === "on" })}
                        />
                    </SettingRow>

                    <SettingRow name="Diagram vignette" desc="soft fade at canvas edges">
                        <Segmented<"on" | "off">
                            value={settings.vignette ? "on" : "off"}
                            options={[
                                { value: "on", label: "On" },
                                { value: "off", label: "Off" },
                            ]}
                            onChange={(value) => onChange({ vignette: value === "on" })}
                        />
                    </SettingRow>
                </div>

                <div className="tonto-modal-footer">
                    <button type="button" className="tonto-action-btn" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

function SettingRow({ name, desc, children }: { name: string; desc: string; children: React.ReactNode }) {
    return (
        <div className="tonto-setting-row">
            <div className="info">
                <span className="name">{name}</span>
                <span className="desc">{desc}</span>
            </div>
            {children}
        </div>
    );
}

type SegmentedOption<T extends string> = { value: T; label: string; icon?: React.ReactNode };

function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: SegmentedOption<T>[];
    onChange: (next: T) => void;
}) {
    return (
        <div className="tonto-segmented" role="radiogroup">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    className={cn(value === option.value && "on")}
                    onClick={() => onChange(option.value)}
                >
                    {option.icon}
                    {option.label}
                </button>
            ))}
        </div>
    );
}
