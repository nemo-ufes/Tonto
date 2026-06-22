import * as React from "react";
import type { TontoDiagramDirection, TontoDiagramFilter, TontoDiagramPresentation } from "tonto-cli";
import { cn } from "../utils/cn";
import { LayoutIcon } from "./icons";
import { TriCheckbox } from "./package-tree";

type ViewPanelProps = {
    presentation: TontoDiagramPresentation;
    filter: TontoDiagramFilter;
    onChangePresentation: (next: Partial<TontoDiagramPresentation>) => void;
    onChangeFilterFlags: (next: { external?: boolean; datatypes?: boolean }) => void;
};

const DIRECTIONS: TontoDiagramDirection[] = ["TB", "BT", "LR", "RL"];

export function ViewPanel({ presentation, filter, onChangePresentation, onChangeFilterFlags }: ViewPanelProps) {
    return (
        <div className="tonto-view-form">
            <div className="tonto-view-field">
                <span className="tonto-view-label">Layout direction</span>
                <div className="tonto-layout-pick">
                    {DIRECTIONS.map((dir) => (
                        <button
                            key={dir}
                            type="button"
                            className={cn(presentation.direction === dir && "on")}
                            onClick={() => onChangePresentation({ direction: dir })}
                            aria-pressed={presentation.direction === dir}
                            title={dir}
                        >
                            <LayoutIcon dir={dir} size={14} />
                            <span>{dir}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="tonto-view-section-title">Presentation</div>
            <Toggle
                label="show stereotypes"
                checked={presentation.stereotypes}
                onChange={(next) => onChangePresentation({ stereotypes: next })}
            />
            <Toggle
                label="show attributes"
                checked={presentation.attributes}
                onChange={(next) => onChangePresentation({ attributes: next })}
            />

            <div className="tonto-view-section-title">Filter</div>
            <Toggle
                label="include external"
                checked={filter.external}
                onChange={(next) => onChangeFilterFlags({ external: next })}
            />
            <Toggle
                label="include datatypes"
                checked={filter.datatypes}
                onChange={(next) => onChangeFilterFlags({ datatypes: next })}
            />
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
    return (
        <label className="tonto-view-toggle-row">
            <span>{label}</span>
            <TriCheckbox
                state={checked ? "checked" : "unchecked"}
                onChange={() => onChange(!checked)}
                ariaLabel={label}
            />
        </label>
    );
}
