import * as React from "react";

type SourcePanelProps = {
    value: string;
    onChange: (next: string) => void;
};

export function SourcePanel({ value, onChange }: SourcePanelProps) {
    const lineCount = React.useMemo(() => value.split("\n").length, [value]);
    return (
        <div className="tonto-source-wrap">
            <div className="tonto-source-header">
                <span>.tontodiagram</span>
                <span className="meta">{lineCount} lines · readonly fallback</span>
            </div>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                spellCheck={false}
                className="tonto-source-textarea"
                aria-label="Diagram source"
            />
        </div>
    );
}
