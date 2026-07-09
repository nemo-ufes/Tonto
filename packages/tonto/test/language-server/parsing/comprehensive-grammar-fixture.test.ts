import path from "node:path";
import { fileURLToPath } from "node:url";
import { AstUtils } from "langium";
import { NodeFileSystem } from "langium/node";
import { beforeAll, describe, expect, it } from "vitest";
import { createDefaultTontoManifest } from "../../../src/cli/model/grammar/TontoManifest.js";
import { buildFolderDocuments, type BuiltFolderDocumentsResult } from "../../../src/cli/utils/buildFolderDocuments.js";
import {
    isAttribute,
    isClassDeclaration,
    isContextModule,
    isDataType,
    isElementRelation,
    isGeneralizationSet,
    isImport,
} from "../../../src/language/generated/ast.js";
import { createTontoServices } from "../../../src/language/tonto-module.js";

const CLASS_CATEGORIES = [
    "class",
    "event",
    "situation",
    "process",
    "category",
    "mixin",
    "phaseMixin",
    "roleMixin",
    "historicalRoleMixin",
    "kind",
    "collective",
    "quantity",
    "quality",
    "mode",
    "intrinsicMode",
    "extrinsicMode",
    "relator",
    "type",
    "powertype",
    "subkind",
    "phase",
    "role",
    "historicalRole",
] as const;

const ONTOLOGICAL_NATURES = [
    "objects",
    "functional-complexes",
    "collectives",
    "quantities",
    "relators",
    "intrinsic-modes",
    "extrinsic-modes",
    "qualities",
    "events",
    "situations",
    "types",
    "abstract-individuals",
] as const;

const RELATION_STEREOTYPES = [
    "material",
    "derivation",
    "comparative",
    "mediation",
    "characterization",
    "externalDependence",
    "componentOf",
    "memberOf",
    "subCollectionOf",
    "subQuantityOf",
    "instantiation",
    "termination",
    "participational",
    "participation",
    "historicalDependence",
    "creation",
    "manifestation",
    "bringsAbout",
    "triggers",
    "composition",
    "aggregation",
    "inherence",
    "value",
    "formal",
    "constitution",
] as const;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(currentDirectory, "../../fixtures/comprehensive-project");

let fixture: BuiltFolderDocumentsResult;

beforeAll(async () => {
    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    fixture = await buildFolderDocuments(fixtureDirectory, services, {
        manifest: {
            ...createDefaultTontoManifest(),
            projectName: "comprehensive-grammar",
        },
        validation: true,
    });
});

describe("comprehensive grammar fixture", () => {
    it("parses and links every source file without blocking diagnostics", () => {
        const sourceDocuments = fixture.documents.all
            .filter((document) => document.uri.fsPath.startsWith(fixtureDirectory))
            .toArray();

        expect(sourceDocuments).toHaveLength(3);
        expect(sourceDocuments.flatMap((document) => document.parseResult.parserErrors)).toHaveLength(0);
        expect(sourceDocuments.flatMap((document) => document.parseResult.lexerErrors)).toHaveLength(0);

        const unresolvedReferences = sourceDocuments
            .flatMap((document) => document.diagnostics ?? [])
            .filter((diagnostic) => diagnostic.message.includes("Could not resolve reference"));
        expect(unresolvedReferences).toHaveLength(0);
    });

    it("covers every class category and ontological nature declared by the grammar", () => {
        const nodes = fixture.models.flatMap((model) => AstUtils.streamAllContents(model).toArray());
        const categories = nodes
            .filter(isClassDeclaration)
            .map((declaration) => declaration.classElementType.ontologicalCategory);
        const natures = nodes.flatMap((node) => {
            if (isClassDeclaration(node)) {
                return node.ontologicalNatures?.natures ?? [];
            }
            if (isDataType(node)) {
                return node.ontologicalNature?.natures ?? [];
            }
            return [];
        });

        expect(new Set(categories)).toEqual(new Set(CLASS_CATEGORIES));
        expect(new Set(natures)).toEqual(new Set(ONTOLOGICAL_NATURES));
    });

    it("covers every built-in relation stereotype and every relation operator", () => {
        const relations = fixture.models
            .flatMap((model) => AstUtils.streamAllContents(model).toArray())
            .filter(isElementRelation);
        const stereotypes = new Set(relations.map((relation) => relation.relationType));

        for (const stereotype of RELATION_STEREOTYPES) {
            expect(stereotypes).toContain(stereotype);
        }
        expect(stereotypes).toContain("customRelation");
        expect(relations.some((relation) => relation.isAssociation)).toBe(true);
        expect(relations.some((relation) => relation.isAggregation)).toBe(true);
        expect(relations.some((relation) => relation.isComposition)).toBe(true);
        expect(relations.some((relation) => relation.isAggregationInverted)).toBe(true);
        expect(relations.some((relation) => relation.isCompositionInverted)).toBe(true);
        expect(relations.some((relation) => relation.specializeRelation !== undefined)).toBe(true);
        expect(relations.some((relation) => relation.hasInverse === "inverseOf")).toBe(true);
    });

    it("covers imports, globals, datatypes, enums, attributes, metadata, and both genset forms", () => {
        const nodes = fixture.models.flatMap((model) => AstUtils.streamAllContents(model).toArray());
        const attributes = nodes.filter(isAttribute);
        const datatypes = nodes.filter(isDataType);
        const generalizationSets = nodes.filter(isGeneralizationSet);

        expect(nodes.filter(isImport).some((modelImport) => modelImport.packageAlias === "Shared")).toBe(true);
        expect(nodes.filter(isContextModule).some((contextModule) => contextModule.isGlobal)).toBe(true);
        expect(datatypes.some((datatype) => datatype.isEnum && datatype.elements.length === 3)).toBe(true);
        expect(datatypes.some((datatype) => datatype.specializationEndurants.length > 0)).toBe(true);
        expect(attributes.some((attribute) => attribute.cardinality?.lowerBound === "*")).toBe(true);
        expect(attributes.some((attribute) => attribute.cardinality?.upperBound === "*")).toBe(true);
        expect(attributes.some((attribute) => attribute.isOrdered && attribute.isConst && attribute.isDerived)).toBe(true);
        expect(generalizationSets.some((genset) => genset.disjoint && genset.complete)).toBe(true);
        expect(generalizationSets.some((genset) => genset.disjoint && !genset.complete)).toBe(true);
        expect(nodes.filter(isClassDeclaration).some((declaration) => declaration.instanceOf !== undefined)).toBe(true);
        expect(nodes.filter(isClassDeclaration).some((declaration) => declaration.label && declaration.description)).toBe(true);
    });
});
