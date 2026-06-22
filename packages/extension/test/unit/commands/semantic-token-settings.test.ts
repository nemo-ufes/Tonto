import { describe, expect, it } from "vitest";
import {
    buildTontoSemanticTokenColorSettingsSnippet,
    buildTontoSemanticTokenColorCustomizations,
    TONTO_SEMANTIC_TOKEN_COLOR_RULES,
} from "../../../src/commands/semantic-token-settings.js";

describe("semantic token settings", () => {
    it("adds Tonto semantic token rules without removing existing customizations", () => {
        const result = buildTontoSemanticTokenColorCustomizations({
            enabled: false,
            rules: {
                customToken: { foreground: "#FFFFFF" },
            },
            "[Some Theme]": {
                rules: {
                    themeToken: { foreground: "#000000" },
                },
            },
        });

        expect(result.enabled).toBe(true);
        expect(result.rules?.customToken).toEqual({ foreground: "#FFFFFF" });
        expect(result.rules?.tontoObjects).toEqual(TONTO_SEMANTIC_TOKEN_COLOR_RULES.tontoObjects);
        expect(result["[Some Theme]"]).toEqual({
            rules: {
                themeToken: { foreground: "#000000" },
            },
        });
    });

    it("builds a settings.json snippet users can copy without applying it", () => {
        const snippet = JSON.parse(buildTontoSemanticTokenColorSettingsSnippet());

        expect(snippet["editor.semanticTokenColorCustomizations"]).toEqual({
            enabled: true,
            rules: TONTO_SEMANTIC_TOKEN_COLOR_RULES,
        });
    });
});
