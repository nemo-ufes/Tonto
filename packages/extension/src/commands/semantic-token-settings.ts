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
        foreground: "#CD6872",
        fontStyle: "bold",
    },
    tontoQualityKind: {
        foreground: "#19B0F1",
        fontStyle: "bold",
    },
    tontoQuantityKind: {
        foreground: "#CD6872",
        fontStyle: "bold",
    },
    tontoCollectiveKind: {
        foreground: "#CD6872",
        fontStyle: "bold",
    },
    tontoRelatorKind: {
        foreground: "#45e72b",
        fontStyle: "bold",
    },
    tontoEvent: {
        foreground: "#d1ca3c",
        fontStyle: "bold",
    },
    tontoModeKind: {
        foreground: "#19b0f1",
        fontStyle: "bold",
    },
    tontoMode: {
        foreground: "#19b0f1",
        fontStyle: "italic",
    },
    tontoSituation: {
        foreground: "#fca90d",
        fontStyle: "bold",
    },
    tontoType: {
        foreground: "#9b69b1",
        fontStyle: "bold",
    },
    tontoObjects: {
        foreground: "#67C3CB",
        fontStyle: "italic",
    },
    tontoFunctionalComplex: {
        foreground: "#f46a6a",
        fontStyle: "italic",
    },
    tontoQuality: {
        foreground: "#19b0f1",
        fontStyle: "italic",
    },
    tontoQuantity: {
        foreground: "#CD6872",
        fontStyle: "italic",
    },
    tontoCollective: {
        foreground: "#CD6872",
        fontStyle: "italic",
    },
    tontoRelator: {
        foreground: "#45e72b",
        fontStyle: "italic",
    },
    tontoNone: {
        foreground: "#a1a1a1",
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
