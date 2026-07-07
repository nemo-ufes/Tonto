import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { Model, isClassDeclaration } from "../../../src/language/generated/ast.js";
import { getModelImports, getPrimaryContextModuleOrThrow } from "../../../src/language/index.js";
import { createTontoServices } from "../../../src/language/tonto-module.js";

describe("Parsing import order", () => {
  const services = createTontoServices(EmptyFileSystem);
  const parse = (input: string) => services.Tonto.parser.LangiumParser.parse<Model>(input);

  it("should parse imports before the package declaration", async () => {
    const result = parse(`
      import Tonto.BasicDataTypes
      package TestPackage
      kind Person
    `);

    expect(result.parserErrors).toHaveLength(0);
    expect(getModelImports(result.value)).toHaveLength(1);
  });

  it("should parse imports after the package declaration before declarations", async () => {
    const result = parse(`
      package TestPackage
      import Tonto.BasicDataTypes
      kind Person
    `);

    expect(result.parserErrors).toHaveLength(0);
    const module = getPrimaryContextModuleOrThrow(result.value);
    expect(getModelImports(result.value)).toHaveLength(1);
    expect(module.declarations.filter(isClassDeclaration).map((item) => item.name)).toEqual(["Person"]);
  });

  it("should parse imports both before and after the package declaration", async () => {
    const result = parse(`
      import Tonto.BasicDataTypes
      package TestPackage
      import Tonto.BasicDataTypes as basics
      kind Person
    `);

    expect(result.parserErrors).toHaveLength(0);
    const imports = getModelImports(result.value);
    expect(imports).toHaveLength(2);
    expect(imports.map((item) => item.packageAlias)).toEqual([undefined, "basics"]);
  });
});
