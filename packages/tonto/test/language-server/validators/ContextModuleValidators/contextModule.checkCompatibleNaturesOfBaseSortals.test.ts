import { EmptyFileSystem } from "langium";
import { describe, expect, it } from "vitest";
import { createTontoServices } from "../../../../src/language/tonto-module.js";
import { validationHelper } from "../../../../src/test/tonto-test.js";

describe("ContextModuleValidator.checkCompatibleNaturesOfBaseSortals", () => {
  const services = createTontoServices(EmptyFileSystem);
  const validate = validationHelper(services.Tonto);

  it("should produce error for base sortal without nature and without specialization", async () => {
    const stub = `
    package TestPackage
    subkind OrphanSubkind
    `;
    const result = await validate(stub);
    const errors = result.diagnostics.filter(
      (d) => d.message.includes("must specify the ontological nature")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("should produce no error for base sortal specializing an ultimate sortal", async () => {
    const stub = `
    package TestPackage
    kind Person
    subkind Student specializes Person
    `;
    const result = await validate(stub);
    const errors = result.diagnostics.filter(
      (d) => d.message.includes("must specify the ontological nature")
    );
    expect(errors).toHaveLength(0);
  });

  it("should produce no error for base sortal specializing an extrinsicMode ultimate sortal", async () => {
    const stub = `
    package TestPackage
    extrinsicMode Test
    subkind A specializes Test
    `;
    const result = await validate(stub);
    const errors = result.diagnostics.filter(
      (d) => d.severity === 1
    );
    expect(errors).toHaveLength(0);
  });

  it("should produce no error for base sortal with declared nature", async () => {
    const stub = `
    package TestPackage
    phase ChildPhase of functional-complexes
    `;
    const result = await validate(stub);
    const errors = result.diagnostics.filter(
      (d) => d.message.includes("must specify the ontological nature")
    );
    expect(errors).toHaveLength(0);
  });

  it("should produce error for role without nature and without specialization", async () => {
    const stub = `
    package TestPackage
    role OrphanRole
    `;
    const result = await validate(stub);
    const errors = result.diagnostics.filter(
      (d) => d.message.includes("must specify the ontological nature")
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
