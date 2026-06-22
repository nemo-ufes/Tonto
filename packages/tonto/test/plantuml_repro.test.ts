import { EmptyFileSystem } from "langium";
import { describe, expect, test } from "vitest";
import { URI } from "vscode-uri";
import { generatePlantUML } from "../src/cli/generators/plantuml.generator.js";
import { Model } from "../src/language/generated/ast.js";
import { getPrimaryContextModuleOrThrow } from "../src/language/index.js";
import { createTontoServices } from "../src/language/tonto-module.js";

describe("PlantUML Generator Reproduction", () => {
  const services = createTontoServices(EmptyFileSystem);
  const documentBuilder = services.shared.workspace.DocumentBuilder;
  const langiumDocuments = services.shared.workspace.LangiumDocuments;
  const metaData = services.Tonto.LanguageMetaData;

  async function parse(input: string, fileName: string) {
      const uri = URI.parse(`file:///${fileName}${metaData.fileExtensions[0]}`);
      const document = services.shared.workspace.LangiumDocumentFactory.fromString<Model>(input, uri);
      langiumDocuments.addDocument(document);
      return document;
  }

  test("should generate definitions and colors for external elements in relations", async () => {
    // Create People package
    await parse(`
        package People
        kind Person
        role Employee specializes Person
    `, "People");

    // Create University package
    await parse(`
        import People
        package University
        
        kind Organization
        roleMixin Employer
        
        kind University specializes Organization
        
        role UniversityEmployer specializes Employer, University
        
        role UniversityProfessor specializes People.Employee
    `, "University");

    // Create Contracts package
    const contractsDoc = await parse(`
        import People
        import University
        package Contracts

        relator EmploymentContract {
            @mediation
            [1..*] -- [1] People.Employee

            @mediation
            [1..*] -- [1] University.UniversityProfessor
        }
    `, "Contracts");

    // Build all documents to resolve references
    await documentBuilder.build(langiumDocuments.all.toArray());
    
    const model = contractsDoc.parseResult.value as Model;
    
    // We want to generate PlantUML for the Contracts package
    const contractsPackage = getPrimaryContextModuleOrThrow(model);
    expect(contractsPackage).toBeDefined();
    expect(contractsPackage.name).toBe("Contracts");

    const puml = generatePlantUML(contractsPackage, { showExternalReferences: true });
    
    expect(puml).toContain(`set separator none`);

    // Check if EmploymentContract is generated
    expect(puml).toContain(`class "EmploymentContract" <<relator>> #99FF99`);

    // Check if external element People.Employee is generated with correct color/stereotype
    // It should be generated because it is referenced in the relation
    // Employee is a role, so it should be LIGHT_PINK #FFDADD
    expect(puml).toContain(`class "People::Employee" <<role>> #FFDADD`);

    // Check if external element University.UniversityProfessor is generated
    // UniversityProfessor is a role, so it should be LIGHT_PINK #FFDADD
    expect(puml).toContain(`class "University::UniversityProfessor" <<role>> #FFDADD`);

    // Check relations
    // External references use longer arrows.
    expect(puml).toContain(`"EmploymentContract" "1..*" ---- "1" "People::Employee"`);
    expect(puml).toContain(`"EmploymentContract" "1..*" ---- "1" "University::UniversityProfessor"`);
  });

  test("should include external relations declared outside the focused module", async () => {
    const peopleDoc = await parse(`
        package IncomingPeople
        kind Person
    `, "IncomingPeople");

    await parse(`
        import IncomingPeople
        package IncomingContracts

        kind Contract

        relation Contract -- engages -- [1] IncomingPeople.Person
    `, "IncomingContracts");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const peoplePackage = getPrimaryContextModuleOrThrow(peopleDoc.parseResult.value as Model);
    const externalReferenceModules = langiumDocuments.all
      .flatMap((document) => getPrimaryContextModuleOrThrow(document.parseResult.value as Model))
      .toArray();

    const puml = generatePlantUML(peoplePackage, { showExternalReferences: true, externalReferenceModules });

    expect(puml).toContain(`class "IncomingContracts::Contract" <<kind>> #FF99A3`);
    expect(puml).toContain(`"IncomingContracts::Contract"  ---- "1" "Person" : <back:WhiteSmoke>engages</back> >`);

    const pumlWithoutExternalReferences = generatePlantUML(peoplePackage, {
      showExternalReferences: false,
      externalReferenceModules,
    });

    expect(pumlWithoutExternalReferences).not.toContain(`class "IncomingContracts::Contract" <<kind>> #FF99A3`);
    expect(pumlWithoutExternalReferences).not.toContain(`engages`);
  });

  test("should render inverseOf labels and include inverse external relations", async () => {
    const peopleDoc = await parse(`
        import InverseAgreements
        package InversePeople

        kind Person {
            [1] -- participatesIn -- [*] InverseAgreements.Contract inverseOf InverseAgreements.Contract.hasParticipant
        }
    `, "InversePeople");

    await parse(`
        import InversePeople
        package InverseAgreements

        kind Contract {
            [1] -- hasParticipant -- [*] InversePeople.Person
        }
    `, "InverseAgreements");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const peoplePackage = getPrimaryContextModuleOrThrow(peopleDoc.parseResult.value as Model);
    const puml = generatePlantUML(peoplePackage, { showExternalReferences: true });

    expect(puml).toContain(`<back:WhiteSmoke>participatesIn</back>\\ninverseOf InverseAgreements.Contract.hasParticipant >`);
    expect(puml).toContain(`"InverseAgreements::Contract" "1" ---- "*" "Person" : <back:WhiteSmoke>hasParticipant</back> >`);
    expect(puml).toContain(`class "InverseAgreements::Contract" <<kind>> #FF99A3`);
  });
});
