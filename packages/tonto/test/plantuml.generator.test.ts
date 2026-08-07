import { EmptyFileSystem } from "langium";
import { describe, expect, test } from "vitest";
import { generatePlantUML } from "../src/cli/generators/plantuml.generator.js";
import { Model } from "../src/language/generated/ast.js";
import { createTontoServices } from "../src/language/tonto-module.js";
import { validationHelper } from "../src/test/tonto-test.js";

describe("PlantUML Generator", () => {
  const services = createTontoServices(EmptyFileSystem);
  const validate = validationHelper(services.Tonto);

  test("should generate correct cardinality for single value [1]", async () => {
    const tontoCode = `
      package TestPackage
      
      kind Person
      kind Company

      relator Employment {
          @mediation
          [1] -- [1..*] Person
          
          @mediation
          [1..*] -- [1] Company
      }
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value as Model;
    
    const puml = generatePlantUML(model);
    
    // Check for correct cardinality generation without directional arrow hints.
    expect(puml).toContain(`"Employment" "1" -- "1..*" "Person"`);
    expect(puml).toContain(`"Employment" "1..*" -- "1" "Company"`);
    
    // Ensure it doesn't generate the incorrect 1..* for [1]
    expect(puml).not.toContain(`"Employment" "1..*" -- "1..*" "Person"`);
  });

  test("should generate orthogonal lines when option is enabled", async () => {
    const tontoCode = `
      package TestPackage
      kind Person
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value as Model;
    
    const puml = generatePlantUML(model, { showExternalReferences: true, orthogonal: true });
    
    expect(puml).toContain("skinparam linetype ortho");
  });

  test("should generate selectable layout directives", async () => {
    const tontoCode = `
      package TestPackage
      kind Person
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value as Model;

    expect(generatePlantUML(model, { showExternalReferences: true, layout: "left-to-right" })).toContain("left to right direction");
    expect(generatePlantUML(model, { showExternalReferences: true, layout: "top-to-bottom" })).toContain("top to bottom direction");
    expect(generatePlantUML(model, { showExternalReferences: true, layout: "polyline" })).toContain("skinparam linetype polyline");
    expect(generatePlantUML(model, { showExternalReferences: true, layout: "smetana" })).toContain("!pragma layout smetana");
    expect(generatePlantUML(model, { showExternalReferences: true, layout: "elk" })).toContain("!pragma layout elk");
  });

  test("should generate correct colors based on stereotypes", async () => {
    const tontoCode = `
      package TestPackage
      
      kind Person
      subkind Man specializes Person
      category PhysicalThing of objects
      relator Employment
      role Employee specializes Person
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value as Model;
    
    const puml = generatePlantUML(model);
    
    // Colors must match the semantic token emitted for each nature.
    expect(puml).toContain(`class "Person" <<kind>> #CD6872`);
    
    expect(puml).toContain(`class "Man" <<subkind>> #F46A6A`);
    
    expect(puml).toContain(`class "Employment" <<relator>> #45E72B`);

    expect(puml).toContain(`class "Employee" <<role>> #F46A6A`);

    expect(puml).toContain(`class "PhysicalThing" <<category>> #67C3CB`);
  });
});
