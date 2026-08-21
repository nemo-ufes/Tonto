import { EmptyFileSystem } from "langium";
import { describe, expect, test } from "vitest";
import { generatePlantUML } from "../src/cli/generators/plantuml.generator.js";
import { createTontoServices } from "../src/language/tonto-module.js";
import { validationHelper } from "../src/test/tonto-test.js";

describe("PlantUML Generator - Directional Arrows", () => {
  const services = createTontoServices(EmptyFileSystem);
  const validate = validationHelper(services.Tonto);

  test("should not generate directional arrows for multiple associations", async () => {
    const tontoCode = `
      package TestPackage
      
      kind Center
      kind Up
      kind Down
      kind Left
      kind Right

      relator CenterRelations {
          @mediation
          [1] -- [1] Center
          
          @mediation
          [1] -- [1] Up

          @mediation
          [1] -- [1] Down

          @mediation
          [1] -- [1] Left

          @mediation
          [1] -- [1] Right
      }
      
      kind Hub {
          [1] -- [1] Up
          [1] -- [1] Down
          [1] -- [1] Left
          [1] -- [1] Right
      }
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value;
    
    const puml = generatePlantUML(model);
    
    // Hub connects to four classes, so degree-based sizing gives it an alias (its code
    // name) with a padded display label; references use that alias instead of the quoted name.
    expect(puml).toContain(`Hub "1" -- "1" "Up"`);
    expect(puml).toContain(`Hub "1" -- "1" "Down"`);
    expect(puml).toContain(`Hub "1" -- "1" "Left"`);
    expect(puml).toContain(`Hub "1" -- "1" "Right"`);
    expect(puml).toMatch(/class Hub as "\s+Hub\s+"/);
    expect(puml).not.toContain(`-r-`);
    expect(puml).not.toContain(`-l-`);
  });

  test("should widen crowded targets so PlantUML can spread connection points", async () => {
    const tontoCode = `
      package TestPackage

      kind Person
      role Student specializes Person
      role Employee specializes Person
      phase Child specializes Person
      phase Adult specializes Person
      kind University {
        [1] -- enrolls -- [*] Person
      }
      kind Company {
        [1] -- employs -- [*] Person
      }
      kind Family {
        [1] -- includes -- [*] Person
      }
      kind Government {
        [1] -- registers -- [*] Person
      }
    `;

    const validationResult = await validate(tontoCode);
    const model = validationResult.document.parseResult.value;

    const spread = generatePlantUML(model, { showExternalReferences: true, sizeByDegree: true });
    const natural = generatePlantUML(model, { showExternalReferences: true, sizeByDegree: false });

    // Person has eight connections, so its label receives twelve spaces on each
    // side. Its alias remains the identity used by every generated link.
    expect(spread).toContain(`class Person as "${" ".repeat(12)}Person${" ".repeat(12)}"`);
    expect(spread.match(/^Person <\|--/gm)).toHaveLength(4);
    expect(spread.match(/-- "\*" Person :/g)).toHaveLength(4);
    expect(natural).toContain(`class "Person"`);
    expect(natural).not.toContain(`class Person as`);
  });
});
