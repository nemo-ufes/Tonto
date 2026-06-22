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
    
    expect(puml).toContain(`"Hub" "1" -- "1" "Up"`);
    expect(puml).toContain(`"Hub" "1" -- "1" "Down"`);
    expect(puml).toContain(`"Hub" "1" -- "1" "Left"`);
    expect(puml).toContain(`"Hub" "1" -- "1" "Right"`);
    expect(puml).not.toContain(`-r-`);
    expect(puml).not.toContain(`-l-`);
  });
});
