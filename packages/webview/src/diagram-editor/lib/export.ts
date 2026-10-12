/**
 * Export helpers for the diagram canvas. We rasterise/serialise the ReactFlow
 * SVG and trigger a browser download. PlantUML export is delegated to the
 * extension host through a postMessage.
 */

const SVG_SELECTOR = ".react-flow__viewport";

function getDiagramBounds(): { x: number; y: number; w: number; h: number } | null {
    const viewport = document.querySelector<HTMLElement>(SVG_SELECTOR);
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    return { x: 0, y: 0, w: rect.width, h: rect.height };
}

/**
 * Inline computed styles into a cloned SVG so the saved file renders the same
 * as it did on screen (no external CSS / CSS variables).
 */
function inlineStyles(source: Element, target: Element): void {
    const sourceStyle = window.getComputedStyle(source);
    const targetEl = target as HTMLElement;
    const inline: string[] = [];
    for (const prop of [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linejoin",
        "stroke-linecap",
        "color",
        "opacity",
        "font",
        "font-family",
        "font-size",
        "font-weight",
        "letter-spacing",
        "text-transform",
    ]) {
        const value = sourceStyle.getPropertyValue(prop);
        if (value) inline.push(`${prop}:${value}`);
    }
    targetEl.setAttribute("style", inline.join(";"));
    const sourceChildren = source.children;
    const targetChildren = target.children;
    for (let i = 0; i < sourceChildren.length; i++) {
        inlineStyles(sourceChildren[i], targetChildren[i]);
    }
}

function serializeViewport(): string | null {
    const flow = document.querySelector<HTMLDivElement>(".react-flow");
    if (!flow) return null;
    const rect = flow.getBoundingClientRect();

    const svgNS = "http://www.w3.org/2000/svg";
    const xhtmlNS = "http://www.w3.org/1999/xhtml";
    const out = document.createElementNS(svgNS, "svg");
    out.setAttribute("xmlns", svgNS);
    out.setAttribute("xmlns:xhtml", xhtmlNS);
    out.setAttribute("width", String(Math.ceil(rect.width)));
    out.setAttribute("height", String(Math.ceil(rect.height)));
    out.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#ffffff");
    out.appendChild(bg);

    // Append cloned edges SVG with inlined styles.
    const edgesSvg = flow.querySelector<SVGSVGElement>("svg.react-flow__edges");
    if (edgesSvg) {
        const clone = edgesSvg.cloneNode(true) as SVGSVGElement;
        inlineStyles(edgesSvg, clone);
        out.appendChild(clone);
    }

    // Append nodes via <foreignObject> to keep HTML/CSS layout.
    const nodesWrap = flow.querySelector<HTMLDivElement>(".react-flow__nodes");
    if (nodesWrap) {
        const fo = document.createElementNS(svgNS, "foreignObject");
        fo.setAttribute("x", "0");
        fo.setAttribute("y", "0");
        fo.setAttribute("width", String(rect.width));
        fo.setAttribute("height", String(rect.height));
        const wrapper = document.createElementNS(xhtmlNS, "div");
        wrapper.setAttribute("xmlns", xhtmlNS);
        const cloned = nodesWrap.cloneNode(true) as HTMLDivElement;
        // Copy computed background tokens so dark/light renders correctly.
        wrapper.style.cssText = `font-family: ${getComputedStyle(document.body).fontFamily}; color: ${getComputedStyle(document.body).color}`;
        wrapper.appendChild(cloned);
        fo.appendChild(wrapper);
        out.appendChild(fo);
    }

    return new XMLSerializer().serializeToString(out);
}

export async function downloadSvg(filename: string): Promise<void> {
    const svg = serializeViewport();
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, `${filename}.svg`);
}

export async function downloadPng(filename: string): Promise<void> {
    const svg = serializeViewport();
    if (!svg) return;
    const bounds = getDiagramBounds();
    if (!bounds) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    try {
        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (event) => reject(event);
        });
        img.src = url;
        await loaded;

        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(bounds.w * scale);
        canvas.height = Math.ceil(bounds.h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        await new Promise<void>((resolve) => {
            canvas.toBlob((b) => {
                if (b) triggerDownload(b, `${filename}.png`);
                resolve();
            }, "image/png");
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
