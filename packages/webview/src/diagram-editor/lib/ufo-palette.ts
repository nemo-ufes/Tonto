import type { TontoDiagramPaletteToken } from "tonto-cli";

export type UfoCategory =
    | "Object"
    | "FunctionalComplex"
    | "Relator"
    | "Quality"
    | "Event"
    | "Situation"
    | "Type"
    | "Abstract"
    | "Unknown";

export type UfoColors = {
    /** Light-mode foreground color used for borders, stripe and stereotype text. */
    color: string;
    /** Dark-mode counterpart of `color`. */
    colorDark: string;
    /** Light-mode pastel tint used to fill the node header. */
    tint: string;
    /** Dark-mode counterpart of `tint`. */
    tintDark: string;
    /** Light-mode node border color (slightly softened from `color`). */
    border: string;
    /** Dark-mode counterpart of `border`. */
    borderDark: string;
    /** Friendly label shown in the legend. */
    label: string;
};

export const UFO_PALETTE: Record<UfoCategory, UfoColors> = {
    Object: {
        color: "#2F7F86", colorDark: "#67C3CB",
        tint: "#DDEDEE", tintDark: "#102529",
        border: "#AFCED1", borderDark: "#1B383D",
        label: "Object",
    },
    FunctionalComplex: {
        color: "#B85450", colorDark: "#E8847F",
        tint: "#F6E7E2", tintDark: "#28181A",
        border: "#D6BCB5", borderDark: "#3A2628",
        label: "Functional complex",
    },
    Relator: {
        color: "#5C8A50", colorDark: "#95C887",
        tint: "#EBF1E5", tintDark: "#1C231A",
        border: "#C9D3BD", borderDark: "#26302A",
        label: "Relator",
    },
    Quality: {
        color: "#3B7FA8", colorDark: "#6BB5E0",
        tint: "#E1ECF3", tintDark: "#152230",
        border: "#BFD3DF", borderDark: "#1E2D3D",
        label: "Quality / mode",
    },
    Event: {
        color: "#A78431", colorDark: "#E5C166",
        tint: "#F2E9D2", tintDark: "#26200F",
        border: "#DAC8A4", borderDark: "#332D17",
        label: "Event",
    },
    Situation: {
        color: "#B86930", colorDark: "#EB9858",
        tint: "#F2E0D0", tintDark: "#2A1B10",
        border: "#DDC3AD", borderDark: "#382517",
        label: "Situation",
    },
    Type: {
        color: "#7B5BA1", colorDark: "#B196D5",
        tint: "#E9E2F1", tintDark: "#20182C",
        border: "#CFC2DD", borderDark: "#2D2438",
        label: "Type",
    },
    Abstract: {
        color: "#5F5750", colorDark: "#B0A89B",
        tint: "#ECE7DE", tintDark: "#1F1C17",
        border: "#CFC8B9", borderDark: "#2A271F",
        label: "Abstract individual",
    },
    Unknown: {
        color: "#6C6358", colorDark: "#9F968A",
        tint: "#E8E2D6", tintDark: "#1C1914",
        border: "#C8C0B0", borderDark: "#26221C",
        label: "Unknown",
    },
};

export function ufoCategoryForPaletteToken(token: TontoDiagramPaletteToken): UfoCategory {
    switch (token) {
        case "objects":
            return "Object";
        case "functional-complexes":
        case "collectives":
        case "quantities":
            return "FunctionalComplex";
        case "relators":
            return "Relator";
        case "qualities":
        case "modes":
            return "Quality";
        case "events":
            return "Event";
        case "situations":
            return "Situation";
        case "types":
            return "Type";
        case "abstract-individuals":
            return "Abstract";
        case "none":
        default:
            return "Unknown";
    }
}
