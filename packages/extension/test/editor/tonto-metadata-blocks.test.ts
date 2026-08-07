import { describe, expect, it } from "vitest";
import { findTontoMetadataBlocks } from "../../src/editor/tonto-metadata-blocks.js";

describe("findTontoMetadataBlocks", () => {
  it("finds multiline label and description blocks", () => {
    const source = `category Organization of functional-complexes {
  label {
    @en "Organization"
    @pt-br "Organização"
    @fr "Organisation"
  }
  description {
    @en "An organized body of people."
    @pt-br "Um corpo organizado de pessoas."
    @fr "Un corps organisé de personnes."
  }
}`;

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "label", startLine: 1, endLine: 5 },
      { kind: "description", startLine: 6, endLine: 10 },
    ]);
  });

  it("ignores braces and metadata keywords inside quoted text", () => {
    const source = `kind Example {
  description {
    @en "A { label { value } } with \\"quoted\\" text"
    @pt-br 'description { valor }'
  }
}`;

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "description", startLine: 1, endLine: 4 },
    ]);
  });

  it("ignores metadata-like text inside comments", () => {
    const source = `/*
label {
  @en "Commented label"
}
*/
kind Example {
  // description {
  //   @en "Commented description"
  // }
  label {
    @en "Visible label"
  }
}`;

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "label", startLine: 9, endLine: 11 },
    ]);
  });

  it("requires exact keywords and skips single-line blocks", () => {
    const source = `kind Example {
  _label {
    @en "Not metadata"
  }
  descriptionText {
    @en "Not metadata"
  }
  label-extra {
    @en "Not metadata"
  }
  label { @en "Already compact" }
  description {
    @en "Fold me"
  }
}`;

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "description", startLine: 11, endLine: 13 },
    ]);
  });

  it("supports comments and newlines between the keyword and opening brace", () => {
    const source = `kind Example {
  label
  /* translator notes */
  {
    @en "Example"
  }
}`;

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "label", startLine: 3, endLine: 5 },
    ]);
  });

  it("counts CRLF lines and ignores unclosed blocks", () => {
    const source = [
      "kind Complete {",
      "  label {",
      '    @en "Complete"',
      "  }",
      "}",
      "kind Incomplete {",
      "  description {",
      '    @en "Incomplete"',
    ].join("\r\n");

    expect(findTontoMetadataBlocks(source)).toEqual([
      { kind: "label", startLine: 1, endLine: 3 },
    ]);
  });
});
