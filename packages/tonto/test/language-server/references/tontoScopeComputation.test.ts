import { EmptyFileSystem } from "langium";
import { replaceIndices } from "langium/test";
import { describe, expect, it } from "vitest";
import { URI } from "vscode-uri";
import { Model } from "../../../src/language/generated/ast.js";
import { getPrimaryContextModuleOrThrow } from "../../../src/language/index.js";
import { createTontoServices } from "../../../src/language/tonto-module.js";

function createTestEnvironment() {
  const services = createTontoServices(EmptyFileSystem);
  const documentBuilder = services.shared.workspace.DocumentBuilder;
  const documentFactory = services.shared.workspace.LangiumDocumentFactory;
  const langiumDocuments = services.shared.workspace.LangiumDocuments;
  const completionProvider = services.Tonto.lsp.CompletionProvider;
  const fileExtension = services.Tonto.LanguageMetaData.fileExtensions[0];

  function createDocument(input: string, fileName: string) {
    const uri = URI.parse(`file:///${fileName}${fileExtension}`);
    const document = documentFactory.fromString<Model>(input, uri);
    langiumDocuments.addDocument(document);
    return document;
  }

  return {
    completionProvider,
    createDocument,
    documentBuilder,
  };
}

describe("TontoScopeComputation", () => {
  it("links an individual's imported classifier, inherited attributes, and enum values", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const people = createDocument(`
      package People
      datatype Text
      enum EyeColor { Blue, Brown }
      kind Person { name: Text eyes: EyeColor }
      subkind Man specializes Person
    `, "individual-people");
    const instances = createDocument(`
      import People
      package Instances
      individual john: people.man { NAME = "John Doe" eyes = People.EyeColor.Blue }
    `, "individual-instances");

    // Consumers may appear before their dependencies in a build batch.
    await documentBuilder.build([instances, people], { validation: true });

    expect(instances.diagnostics).toEqual([]);
    for (const reference of instances.references) {
      expect(reference.ref).toBeDefined();
      expect(reference.$nodeDescription?.documentUri.toString()).toBe(people.uri.toString());
    }
  });

  it("validates inherited individual attributes from an imported generalization set", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const people = createDocument(`
      package People
      datatype Text
      kind Person { name: Text }
      phase Adult
      phase Child
      genset Stages where Adult, Child specializes Person
    `, "individual-gensets");
    const instances = createDocument(`
      import People
      package Instances
      individual john: Adult {}
    `, "individual-genset-instances");

    await documentBuilder.build([instances, people], { validation: true });

    expect(instances.diagnostics?.map((diagnostic) => diagnostic.message)).toEqual([
      'Missing mandatory attribute "name" for "Adult".',
    ]);
  });

  it.each([
    ['individual john: <|>', ["Person", "Man"], ["Text", "john"]],
    ['individual john: Man { <|> }', ["name", "age"], ["unrelated"]],
    ['individual john: Man { eyes = <|> }', ["Blue", "EyeColor.Blue"], ["Green", "Other.Green"]],
  ])("completes individual classifiers, attributes, and enum values: %s", async (declaration, included, excluded) => {
    const { completionProvider, createDocument, documentBuilder } = createTestEnvironment();
    const { output, indices } = replaceIndices({ text: `
      package People
      datatype Text
      enum EyeColor { Blue, Brown }
      enum Other { Green }
      kind Person { name: Text }
      subkind Man specializes Person { age: Text eyes: EyeColor }
      kind Unrelated { unrelated: Text }
      ${declaration}
    ` });
    const document = createDocument(output, "individual-completion");
    await documentBuilder.build([document]);
    const completion = await completionProvider?.getCompletion(document, {
      textDocument: { uri: document.textDocument.uri },
      position: document.textDocument.positionAt(indices[0]),
    });
    const labels = completion?.items.map((item) => item.label) ?? [];
    for (const label of included) {
      expect(labels).toContain(label);
    }
    for (const label of excluded) {
      expect(labels).not.toContain(label);
    }
  });

  it("exports qualified names for declarations in global packages", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const primitivesDocument = createDocument(`
      global package primitives
      datatype UUID
    `, "primitives");
    const usersDocument = createDocument(`
      package users
      kind User {
        id : primitives.UUID
      }
    `, "users");

    await documentBuilder.build([primitivesDocument, usersDocument]);

    const importedTypeReference = usersDocument.references.find(
      (reference) => reference.$refText === "primitives.UUID"
    );

    expect(importedTypeReference?.ref?.$type).toBe("DataType");
    expect(importedTypeReference?.$nodeDescription?.documentUri.toString()).toBe(
      primitivesDocument.uri.toString()
    );
  });

  it("keeps imported declarations tied to their source document", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const peopleDocument = createDocument(`
      package People
      kind Person
    `, "People");
    const universityDocument = createDocument(`
      import People
      package University

      role Professor specializes People.Person
    `, "University");

    await documentBuilder.build([peopleDocument, universityDocument]);

    const importedClassReference = universityDocument.references.find(
      (reference) => reference.$refText === "People.Person"
    );

    expect(importedClassReference?.ref?.$type).toBe("ClassDeclaration");
    expect(importedClassReference?.$nodeDescription?.documentUri.toString()).toBe(
      peopleDocument.uri.toString()
    );
  });

  it("resolves imports declared after the package declaration", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const peopleDocument = createDocument(`
      package People
      kind Person
    `, "PeoplePostPackageImport");
    const universityDocument = createDocument(`
      package University
      import People

      role Professor specializes People.Person
    `, "UniversityPostPackageImport");

    await documentBuilder.build([peopleDocument, universityDocument]);

    const importedClassReference = universityDocument.references.find(
      (reference) => reference.$refText === "People.Person"
    );

    expect(universityDocument.parseResult.parserErrors).toHaveLength(0);
    expect(importedClassReference?.ref?.$type).toBe("ClassDeclaration");
    expect(importedClassReference?.$nodeDescription?.documentUri.toString()).toBe(
      peopleDocument.uri.toString()
    );
  });

  it("adds generalization sets to the primary module local scope", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const document = createDocument(`
      package ScopePackage
      kind Person
      subkind Student specializes Person
      subkind Teacher specializes Person
      genset PersonGenset {
        general Person
        specifics Student, Teacher
      }
    `, "ScopePackage");

    await documentBuilder.build([document]);

    expect(document.parseResult.parserErrors).toHaveLength(0);

    const contextModule = getPrimaryContextModuleOrThrow(document.parseResult.value);
    const scopeNames = document.localSymbols?.getStream(contextModule).map((description) => description.name).toArray() ?? [];

    expect(scopeNames).toContain("PersonGenset");
    expect(scopeNames).toContain("ScopePackage.PersonGenset");
  });

  it("resolves fully qualified internal relation references from imported packages", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const peopleDocument = createDocument(`
      package People
      kind Person {
        [1] -- associates -- [*] ({ ordered } contacts) Person
      }
    `, "People");
    const universityDocument = createDocument(`
      import People
      package University

      role Professor specializes People.Person {
        [1] -- colleagues -- [*] ({ subsets People.Person.associates.contacts } peers) Professor specializes People.Person.associates
      }
    `, "University");

    await documentBuilder.build([peopleDocument, universityDocument]);

    const importedRelationReference = universityDocument.references.find(
      (reference) => reference.$refText === "People.Person.associates"
    );
    const importedRelationEndReference = universityDocument.references.find(
      (reference) => reference.$refText === "People.Person.associates.contacts"
    );

    expect(importedRelationReference?.ref?.$type).toBe("ElementRelation");
    expect(importedRelationReference?.$nodeDescription?.documentUri.toString()).toBe(
      peopleDocument.uri.toString()
    );
    expect(importedRelationEndReference?.ref?.$type).toBe("RelationMetaAttributes");
    expect(importedRelationEndReference?.$nodeDescription?.documentUri.toString()).toBe(
      peopleDocument.uri.toString()
    );
  });

  it("resolves global relation and relation-end references for subsets and redefines", async () => {
    const { createDocument, documentBuilder } = createTestEnvironment();
    const ontologyDocument = createDocument(`
      global package People
      kind Person {
        [1] -- associates -- [*] ({ ordered } contacts) Person
      }
    `, "People");
    const universityDocument = createDocument(`
      package University

      role Professor specializes People.Person {
        [1] -- colleagues -- [*] ({ subsets People.Person.associates.contacts, redefines People.Person.associates.contacts } peers) Professor specializes People.Person.associates
      }
    `, "University");

    await documentBuilder.build([ontologyDocument, universityDocument]);

    const globalRelationReference = universityDocument.references.find(
      (reference) => reference.$refText === "People.Person.associates"
    );
    const globalRelationEndReferences = universityDocument.references.filter(
      (reference) => reference.$refText === "People.Person.associates.contacts"
    );

    expect(globalRelationReference?.ref?.$type).toBe("ElementRelation");
    expect(globalRelationReference?.$nodeDescription?.documentUri.toString()).toBe(
      ontologyDocument.uri.toString()
    );
    expect(globalRelationEndReferences).toHaveLength(2);
    expect(globalRelationEndReferences.every((reference) => reference.ref?.$type === "RelationMetaAttributes")).toBe(true);
    expect(globalRelationEndReferences.every(
      (reference) => reference.$nodeDescription?.documentUri.toString() === ontologyDocument.uri.toString()
    )).toBe(true);
  });

  it("offers global relation-end completions for subsets and redefines", async () => {
    const { completionProvider, createDocument, documentBuilder } = createTestEnvironment();
    const ontologyDocument = createDocument(`
      global package People
      kind Person {
        [1] -- associates -- [*] ({ ordered } contacts) Person
      }
    `, "People");
    const { output, indices } = replaceIndices({
      text: `
        package University

        role Professor specializes People.Person {
          [1] -- colleagues -- [*] ({ subsets <|> } peers) Professor specializes People.Person.associates
        }
      `,
    });
    const universityDocument = createDocument(output, "University");

    await documentBuilder.build([ontologyDocument, universityDocument]);

    const completions = await completionProvider?.getCompletion(universityDocument, {
      textDocument: { uri: universityDocument.textDocument.uri },
      position: universityDocument.textDocument.positionAt(indices[0]),
    });
    const labels = completions?.items.map((item) => item.label) ?? [];

    expect(labels).toContain("contacts");
    expect(labels).toContain("Person.associates.contacts");
    expect(labels).toContain("People.Person.associates.contacts");
  });
});
