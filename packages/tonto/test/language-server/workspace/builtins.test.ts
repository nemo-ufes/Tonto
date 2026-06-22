import { describe, expect, it } from "vitest";
import { URI, Utils } from "vscode-uri";
import { builtInLibs } from "../../../src/language/workspace/builtins/index.js";

describe("built-in workspace documents", () => {
    it("use a Tonto URI path extension so Langium can select the language services", () => {
        const [basicDataTypes] = builtInLibs;
        const uri = URI.parse(basicDataTypes.uri);

        expect(uri.authority).toBe("");
        expect(Utils.extname(uri)).toBe(".tonto");
    });
});
