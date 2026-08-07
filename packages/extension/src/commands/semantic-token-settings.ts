import { TONTO_SEMANTIC_TOKEN_COLORS } from "tonto-cli";

export type SemanticTokenColorRule = {
    foreground?: string;
    fontStyle?: string;
};

export type SemanticTokenColorCustomizations = {
    enabled?: boolean;
    rules?: Record<string, SemanticTokenColorRule>;
    [key: string]: unknown;
};

export const TONTO_SEMANTIC_TOKEN_COLOR_RULES: Record<string, SemanticTokenColorRule> = {
    tontoKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoKind,
        fontStyle: "bold",
    },
    tontoQualityKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoQualityKind,
        fontStyle: "bold",
    },
    tontoQuantityKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoQuantityKind,
        fontStyle: "bold",
    },
    tontoCollectiveKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoCollectiveKind,
        fontStyle: "bold",
    },
    tontoRelatorKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoRelatorKind,
        fontStyle: "bold",
    },
    tontoEvent: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoEvent,
        fontStyle: "bold",
    },
    tontoModeKind: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoModeKind,
        fontStyle: "bold",
    },
    tontoMode: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoMode,
        fontStyle: "italic",
    },
    tontoSituation: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoSituation,
        fontStyle: "bold",
    },
    tontoType: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoType,
        fontStyle: "bold",
    },
    tontoObjects: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoObjects,
        fontStyle: "italic",
    },
    tontoFunctionalComplex: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoFunctionalComplex,
        fontStyle: "italic",
    },
    tontoQuality: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoQuality,
        fontStyle: "italic",
    },
    tontoQuantity: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoQuantity,
        fontStyle: "italic",
    },
    tontoCollective: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoCollective,
        fontStyle: "italic",
    },
    tontoRelator: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoRelator,
        fontStyle: "italic",
    },
    tontoNone: {
        foreground: TONTO_SEMANTIC_TOKEN_COLORS.tontoNone,
    },
};

export const TONTO_SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS: SemanticTokenColorCustomizations = {
    enabled: true,
    rules: TONTO_SEMANTIC_TOKEN_COLOR_RULES,
};

export function buildTontoSemanticTokenColorCustomizations(
    currentValue: unknown
): SemanticTokenColorCustomizations {
    const current = isRecord(currentValue) ? currentValue : {};
    const currentRules = isRecord(current.rules)
        ? current.rules as Record<string, SemanticTokenColorRule>
        : {};

    return {
        ...current,
        enabled: true,
        rules: {
            ...currentRules,
            ...TONTO_SEMANTIC_TOKEN_COLOR_RULES,
        },
    };
}

export function buildTontoSemanticTokenColorSettingsSnippet(): string {
    return JSON.stringify({
        "editor.semanticTokenColorCustomizations": TONTO_SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS,
    }, null, 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
