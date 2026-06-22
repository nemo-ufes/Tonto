import * as React from "react";
import type { DiagramExportFormat } from "../messages";

type ExportFabProps = {
    onExport: (format: DiagramExportFormat) => void;
};

export function ExportFab({ onExport }: ExportFabProps) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        function onPointer(event: PointerEvent) {
            if (!ref.current) return;
            if (event.target instanceof Node && ref.current.contains(event.target)) return;
            setOpen(false);
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }
        window.addEventListener("pointerdown", onPointer);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointer);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    function fire(format: DiagramExportFormat) {
        setOpen(false);
        onExport(format);
    }

    return (
        <div className="tonto-export-fab" ref={ref}>
            {open ? (
                <div className="tonto-export-pop" role="menu" aria-label="Export options">
                    <div className="tonto-export-pop-header">Export diagram</div>
                    <button type="button" className="tonto-export-pop-item" onClick={() => fire("png")} role="menuitem">
                        <span>Export as PNG</span>
                        <span className="kbd">.png</span>
                    </button>
                    <button type="button" className="tonto-export-pop-item" onClick={() => fire("svg")} role="menuitem">
                        <span>Export as SVG</span>
                        <span className="kbd">.svg</span>
                    </button>
                    <button type="button" className="tonto-export-pop-item" onClick={() => fire("plantuml")} role="menuitem">
                        <span>Generate PlantUML</span>
                        <span className="kbd">.puml</span>
                    </button>
                </div>
            ) : null}
            <button
                type="button"
                className="tonto-export-btn"
                title="Export diagram"
                aria-label="Export diagram"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((prev) => !prev)}
            >
                <DownloadIcon />
            </button>
        </div>
    );
}

function DownloadIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 19h14" />
        </svg>
    );
}
