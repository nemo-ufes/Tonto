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
    expect(puml).toContain(`class "EmploymentContract" <<relator>> #45E72B`);

    // Check if external element People.Employee is generated with correct color/stereotype
    // It should be generated because it is referenced in the relation
    // Employee is a role, so it uses the functional-complex semantic token color. With package grouping the
    // module is shown by the surrounding package box, so the label is the simple name.
    expect(puml).toContain(`package "People" {`);
    expect(puml).toContain(`class People_Employee as "Employee" <<role>> #F46A6A`);

    // Check if external element University.UniversityProfessor is generated
    // UniversityProfessor is a role, so it uses the functional-complex semantic token color.
    expect(puml).toContain(`package "University" {`);
    expect(puml).toContain(`class University_UniversityProfessor as "UniversityProfessor" <<role>> #F46A6A`);

    // Check relations
    // External references use longer arrows.
    expect(puml).toContain(`"EmploymentContract" "1..*" ---- "1" People_Employee`);
    expect(puml).toContain(`"EmploymentContract" "1..*" ---- "1" University_UniversityProfessor`);
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

    expect(puml).toContain(`class IncomingContracts_Contract as "Contract" <<kind>> #CD6872`);
    expect(puml).toContain(`IncomingContracts_Contract  ---- "1" "Person" : <back:WhiteSmoke>engages</back> >`);

    const pumlWithoutExternalReferences = generatePlantUML(peoplePackage, {
      showExternalReferences: false,
      externalReferenceModules,
    });

    expect(pumlWithoutExternalReferences).not.toContain(`class IncomingContracts_Contract as "Contract" <<kind>> #CD6872`);
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
    expect(puml).toContain(`InverseAgreements_Contract "1" ---- "*" "Person" : <back:WhiteSmoke>hasParticipant</back> >`);
    expect(puml).toContain(`class InverseAgreements_Contract as "Contract" <<kind>> #CD6872`);
  });

  test("should alias qualified external specialization targets", async () => {
    await parse(`
        package UfoAlias
        category Entity of objects
        category Relator of relators
    `, "UfoAlias");

    const mainDoc = await parse(`
        import UfoAlias
        package AliasMain

        kind Person specializes UfoAlias.Entity
        relator IndividualPaperAuthorship specializes UfoAlias.Relator
    `, "AliasMain");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const mainPackage = getPrimaryContextModuleOrThrow(mainDoc.parseResult.value as Model);
    const puml = generatePlantUML(mainPackage, { showExternalReferences: true });

    expect(puml).toContain(`class UfoAlias_Entity as "Entity" <<category>>`);
    expect(puml).toContain(`class UfoAlias_Relator as "Relator" <<category>>`);
    expect(puml).toContain(`UfoAlias_Entity <|---- "Person"`);
    expect(puml).toContain(`UfoAlias_Relator <|---- "IndividualPaperAuthorship"`);
    expect(puml).not.toContain(`"UfoAlias::Entity" <|---- "Person"`);
    expect(puml).not.toContain(`"UfoAlias::Relator" <|---- "IndividualPaperAuthorship"`);

    // The focused package is not boxed, but its external references are.
    expect(puml).toContain(`package "UfoAlias" {`);
    expect(puml).not.toContain(`package "AliasMain" {`);
  });

  test("groups unresolved external references inside their package box", async () => {
    // `ufo` is referenced but never defined (e.g. a library that was not loaded),
    // so the reference stays unresolved. It must still render as `Entity` inside a
    // `ufo` package box rather than as a loose, qualified node.
    const mainDoc = await parse(`
        package Sample
        category Thing specializes ufo.Entity
    `, "Sample");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const mainPackage = getPrimaryContextModuleOrThrow(mainDoc.parseResult.value as Model);
    const puml = generatePlantUML(mainPackage, { showExternalReferences: true });

    expect(puml).toContain(`package "ufo" {`);
    expect(puml).toContain(`class ufo_Entity as "Entity"`);
    expect(puml).toContain(`ufo_Entity <|---- "Thing"`);

    // With external grouping disabled, the same reference stays qualified and loose.
    const flat = generatePlantUML(mainPackage, { showExternalReferences: true, groupExternalPackages: false });
    expect(flat).not.toContain(`package "ufo" {`);
  });

  test("filters full diagrams by package without reintroducing hidden packages as external references", async () => {
    const visibleDoc = await parse(`
        import PackageFilterHidden
        package PackageFilterVisible

        kind VisibleRoom {
            [1] -- connectsTo -- [1] PackageFilterHidden.HiddenBuilding
        }
    `, "PackageFilterVisible");
    const hiddenDoc = await parse(`
        package PackageFilterHidden
        kind HiddenBuilding
    `, "PackageFilterHidden");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const visiblePackage = getPrimaryContextModuleOrThrow(visibleDoc.parseResult.value as Model);
    const hiddenPackage = getPrimaryContextModuleOrThrow(hiddenDoc.parseResult.value as Model);
    const puml = generatePlantUML([visiblePackage, hiddenPackage], {
      showExternalReferences: true,
      includedPackageNames: ["PackageFilterVisible"],
    });

    expect(puml).toContain(`VisibleRoom`);
    expect(puml).not.toContain(`PackageFilterHidden`);
    expect(puml).not.toContain(`HiddenBuilding`);
    expect(puml).not.toContain(`connectsTo`);
  });

  test("can hide package qualifiers in full-diagram card labels without changing node identity", async () => {
    const firstDoc = await parse(`
        package CardLabelsOne
        kind Room
    `, "CardLabelsOne");
    const secondDoc = await parse(`
        package CardLabelsTwo
        kind Room
    `, "CardLabelsTwo");

    await documentBuilder.build(langiumDocuments.all.toArray());

    const modules = [firstDoc, secondDoc]
      .map((document) => getPrimaryContextModuleOrThrow(document.parseResult.value as Model));
    const qualified = generatePlantUML(modules, {
      showExternalReferences: true,
      showPackageNames: false,
      showPackageNamesInCards: true,
    });
    const simple = generatePlantUML(modules, {
      showExternalReferences: true,
      showPackageNames: false,
      showPackageNamesInCards: false,
    });

    expect(qualified).toContain(`class CardLabelsOne_Room as "CardLabelsOne::Room"`);
    expect(qualified).toContain(`class CardLabelsTwo_Room as "CardLabelsTwo::Room"`);
    expect(simple).toContain(`class CardLabelsOne_Room as "Room"`);
    expect(simple).toContain(`class CardLabelsTwo_Room as "Room"`);
  });
});
