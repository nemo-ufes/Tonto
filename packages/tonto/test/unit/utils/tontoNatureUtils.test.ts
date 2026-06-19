import { describe, expect, it } from "vitest";
import { tontoNatureUtils } from "../../../src/language/utils/tontoNatureUtils.js";

describe("tontoNatureUtils", () => {
  it("uses a dedicated semantic token for objects nature", () => {
    expect(tontoNatureUtils.getSemanticTokenFromNature({ nature: "objects", isKind: false })).toBe("tontoObjects");
  });
});
