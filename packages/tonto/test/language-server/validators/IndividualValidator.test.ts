import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { isIndividual, type Model } from "../../../src/language/generated/ast.js";
import { createTontoServices } from "../../../src/language/tonto-module.js";
import { getPrimaryContextModuleOrThrow } from "../../../src/language/utils/modelStatements.js";
import { basicDataTypes } from "../../../src/language/workspace/builtins/basicDataTypes.js";
import { parseHelper, validationHelper } from "../../../src/test/tonto-test.js";

async function validate(source: string) {
  const services = createTontoServices(EmptyFileSystem);
  await parseHelper<Model>(services.Tonto)(basicDataTypes);
  const result = await validationHelper<Model>(services.Tonto)(`package Individuals\n${source}`);
  expect(result.document.parseResult.lexerErrors).toEqual([]);
  expect(result.document.parseResult.parserErrors).toEqual([]);
  return {
    ...result,
    errors: result.diagnostics.filter((diagnostic) => diagnostic.severity === 1),
    individuals: getPrimaryContextModuleOrThrow(result.document.parseResult.value).declarations.filter(isIndividual),
  };
}

describe("individual declarations", () => {
  it("parses, links, and validates the requested syntax", async () => {
    const { errors, individuals } = await validate(`
      kind Man { name: string }
      individual john: Man { name = "John Doe" }
    `);
    expect(errors).toEqual([]);
    expect(individuals[0].name).toBe("john");
    expect(individuals[0].type.ref?.name).toBe("Man");
    expect(individuals[0].assignments[0].attribute.ref?.name).toBe("name");
    expect(individuals[0].assignments[0].values[0]).toMatchObject({ $type: "StringLiteral", value: "John Doe" });
  });

  it.each([
    "class", "event", "situation", "process", "category", "mixin", "phaseMixin", "roleMixin",
    "historicalRoleMixin", "kind", "collective", "quantity", "quality", "mode", "intrinsicMode",
    "extrinsicMode", "relator", "type", "powertype", "subkind", "phase", "role", "historicalRole",
  ])("can instantiate a %s declaration", async (stereotype) => {
    const { individuals, errors } = await validate(`
      ${stereotype} Target { name: string }
      individual example: Target { name = "Example" }
    `);
    expect(individuals[0].type.ref?.classElementType.ontologicalCategory).toBe(stereotype);
    // Standalone roles/phases can have their own unrelated ontology diagnostics.
    expect(errors.filter((error) => /individual|attribute|reference|value/i.test(error.message))).toEqual([]);
  });

  it.each(["Missing", "string", "john"])("rejects an invalid classifier %s", async (target) => {
    const { errors } = await validate(`kind Man individual john: ${target} {}`);
    expect(errors.some((error) => error.message.includes("Could not resolve reference to ClassDeclaration"))).toBe(true);
  });

  it("requires an explicit classifier", async () => {
    const services = createTontoServices(EmptyFileSystem);
    const result = await parseHelper<Model>(services.Tonto)("package Individuals individual john {}");
    expect(result.parseResult.parserErrors.length).toBeGreaterThan(0);
  });

  it.each([
    "individual john", "individual john:", "individual john: Man {", "individual john: Man { name =",
  ])("handles incomplete declarations while editing: %s", async (source) => {
    const services = createTontoServices(EmptyFileSystem);
    const { diagnostics } = await validationHelper<Model>(services.Tonto)(`package Individuals kind Man ${source}`);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("An error occurred"))).toBe(false);
  });

  it("supports escaped quotes and backslashes in string values", async () => {
    const { errors, individuals } = await validate(String.raw`
      kind Man { name: string }
      individual john: Man { name = "John \"Johnny\" Doe\\Smith" }
    `);
    expect(errors).toEqual([]);
    expect(individuals[0].assignments[0].values[0]).toMatchObject({ value: 'John "Johnny" Doe\\Smith' });
  });

  it("requires default and explicitly mandatory attributes", async () => {
    const { errors } = await validate(`
      kind Man { name: string age: number [1] }
      individual john: Man {}
    `);
    expect(errors.map((error) => error.message)).toEqual([
      'Missing mandatory attribute "name" for "Man".',
      'Missing mandatory attribute "age" for "Man".',
    ]);
  });

  it("allows optional, unbounded, prohibited, and derived attributes to be omitted", async () => {
    const { errors } = await validate(`
      kind Man {
        nickname: string [0..1]
        aliases: string [*]
        tags: string [0..*]
        unused: string [0]
        age: number { derived }
      }
      individual john: Man {}
    `);
    expect(errors).toEqual([]);
  });

  it("requires const attributes and validates supplied derived values", async () => {
    const { errors } = await validate(`
      kind Man { name: string { const } age: number { derived } }
      individual john: Man { age = "unknown" }
    `);
    expect(errors.map((error) => error.message)).toEqual([
      'Missing mandatory attribute "name" for "Man".',
      'Invalid value for datatype "number": expected a number literal.',
    ]);
  });

  it("inherits mandatory attributes transitively through specialization", async () => {
    const { errors } = await validate(`
      kind Person { name: string }
      subkind Man specializes Person { age: number }
      subkind AdultMan specializes Man
      individual john: AdultMan { age = 30 }
    `);
    expect(errors.map((error) => error.message)).toEqual(['Missing mandatory attribute "name" for "AdultMan".']);
  });

  it.each([
    "genset LifeStages { general Person specifics Adult, Child }",
    "genset LifeStages where Adult, Child specializes Person",
  ])("inherits attributes from generalization sets: %s", async (generalization) => {
    const { errors, individuals } = await validate(`
      kind Person { name: string }
      phase Adult
      phase Child
      ${generalization}
      individual john: Adult { name = "John" }
      individual jane: Child {}
    `);
    expect(individuals[0].assignments[0].attribute.ref?.$container.name).toBe("Person");
    expect(errors.map((error) => error.message)).toEqual(['Missing mandatory attribute "name" for "Child".']);
  });

  it("does not duplicate diamond-inherited requirements or loop on inheritance cycles", async () => {
    const diamond = await validate(`
      kind Person { name: string }
      subkind Man specializes Person
      subkind Adult specializes Person
      subkind AdultMan specializes Man, Adult
      individual john: AdultMan {}
    `);
    expect(diamond.errors.map((error) => error.message)).toEqual(['Missing mandatory attribute "name" for "AdultMan".']);
    const cycle = await validate(`
      class First specializes Second { name: string }
      class Second specializes First
      individual sample: Second {}
    `);
    expect(cycle.errors.filter((error) => error.message.includes("Missing mandatory"))).toHaveLength(1);
    expect(cycle.errors.some((error) => error.message.includes("An error occurred"))).toBe(false);
  });

  it.each([
    ["", '"John"', true],
    ["[1]", "[]", false],
    ["[0]", '"John"', false],
    ["[0..1]", "[]", true],
    ["[0..1]", '["John", "Johnny"]', false],
    ["[2]", '["John", "Johnny"]', true],
    ["[2..3]", '["John"]', false],
    ["[2..3]", '["John", "Johnny", "J", "JD"]', false],
    ["[*]", "[]", true],
    ["[1..*]", "[]", false],
    ["[1..*]", '["John", "Johnny"]', true],
  ])("checks cardinality %s for %s", async (cardinality, values, valid) => {
    const { errors } = await validate(`kind Man { names: string ${cardinality} } individual john: Man { names = ${values} }`);
    expect(errors).toHaveLength(valid ? 0 : 1);
    if (!valid) {
      expect(errors[0].message).toContain('Attribute "names" requires');
    }
  });

  it("rejects unknown attributes and duplicate assignments case-insensitively", async () => {
    const { errors } = await validate(`
      kind Man { name: string }
      kind Other { surname: string }
      individual john: Man { name = "John" NAME = "Johnny" surname = "Doe" }
    `);
    expect(errors).toHaveLength(2);
    expect(errors.some((error) => error.message.includes("Could not resolve reference to Attribute named 'surname'"))).toBe(true);
    expect(errors.some((error) => error.message.includes('Duplicated assignment for attribute "NAME"'))).toBe(true);
  });

  it("rejects duplicate individual names case-insensitively", async () => {
    const { errors } = await validate("kind Man individual john: Man {} individual JOHN: Man {}");
    expect(errors.map((error) => error.message)).toEqual(['Duplicated individual declaration "JOHN".']);
  });

  it("accepts primitive literals and primitive datatype specializations", async () => {
    const { errors, individuals } = await validate(`
      datatype Age specializes number
      datatype DisplayName specializes string
      kind Man { name: DisplayName age: Age active: boolean scores: number [*] birthday: date }
      individual john: Man { name = 'John Doe' age = 30 active = false scores = [-1.5, +2, 0] birthday = "1996-08-27" }
    `);
    expect(errors).toEqual([]);
    expect(individuals[0].assignments[2].values[0]).toMatchObject({ value: false });
    expect(individuals[0].assignments[3].values).toMatchObject([{ value: -1.5 }, { value: 2 }, { value: 0 }]);
  });

  it.each([
    ["string", "42"], ["number", '"42"'], ["boolean", '"true"'], ["date", "42"],
    ["time", "true"], ["datetime", "false"], ["number", "{}"],
  ])("rejects %s values written as %s", async (datatype, literal) => {
    const { errors } = await validate(`kind Man { data: ${datatype} } individual john: Man { data = ${literal} }`);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(`Invalid value for datatype "${datatype}"`);
  });

  it("checks each list value against the datatype", async () => {
    const { errors } = await validate('kind Man { ages: number [*] } individual john: Man { ages = [1, "2"] }');
    expect(errors.map((error) => error.message)).toEqual(['Invalid value for datatype "number": expected a number literal.']);
  });

  it.each(["Blue", "EyeColor.Blue", "Individuals.EyeColor.Blue", "blue"])("resolves enum member %s", async (member) => {
    const { errors } = await validate(`enum EyeColor { Blue, Brown } kind Man { eyes: EyeColor } individual john: Man { eyes = ${member} }`);
    expect(errors).toEqual([]);
  });

  it.each(["Green", "Other.Blue", '"Blue"', "42"])("rejects invalid enum value %s", async (member) => {
    const { errors } = await validate(`
      enum EyeColor { Blue, Brown } enum Other { Blue, Green }
      kind Man { eyes: EyeColor } individual john: Man { eyes = ${member} }
    `);
    expect(errors).toHaveLength(1);
  });

  it("validates mandatory attributes of nested structured datatype values", async () => {
    const { errors } = await validate(`
      datatype Location { city: string }
      datatype Address specializes Location { street: string postalCode: string [0..1] }
      kind Man { addresses: Address [1..*] }
      individual john: Man { addresses = [{ city = "Vitoria" street = "Main" }, { street = "Second" }] }
    `);
    expect(errors.map((error) => error.message)).toEqual(['Missing mandatory attribute "city" for "Address".']);
  });

  it("rejects unknown, duplicated, or mistyped nested fields", async () => {
    const { errors } = await validate(`
      datatype Address { city: string }
      kind Man { address: Address }
      individual john: Man { address = { city = 42 CITY = "Vitoria" street = "Main" } }
    `);
    expect(errors).toHaveLength(3);
    expect(errors.some((error) => error.message.includes("An error occurred"))).toBe(false);
  });

  it("does not allow a scalar to bypass a structured datatype's requirements", async () => {
    const { errors } = await validate(`
      datatype Address { city: string }
      kind Man { address: Address }
      individual john: Man { address = "Vitoria" }
    `);
    expect(errors.map((error) => error.message)).toEqual([
      'Invalid value for datatype "Address": expected an object containing its attribute values.',
    ]);
  });
});
