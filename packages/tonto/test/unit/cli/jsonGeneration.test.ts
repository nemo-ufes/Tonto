import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MultilingualText, Project } from "ontouml-js";
import { afterEach, describe, expect, it } from "vitest";
import { generateModularCommand } from "../../../src/cli/actions/commands/generateCommand.js";
import { attributeGenerator } from "../../../src/cli/generators/attribute.generator.js";
import { createDefaultTontoManifest } from "../../../src/cli/model/grammar/TontoManifest.js";
import {
    JSON_GENERATION_STEPS,
    formatJsonGenerationErrorMessage,
    isJsonGenerationError,
} from "../../../src/cli/requests/jsonGeneration.js";

const tempDirs: string[] = [];

function createTempProject(sourceText: string): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonto-json-generation-"));
    tempDirs.push(tempDir);

    const manifest = {
        ...createDefaultTontoManifest(),
        projectName: "test-project",
        displayName: "Test Project",
        publisher: "test-publisher",
        authors: [],
    };

    fs.writeFileSync(path.join(tempDir, "tonto.json"), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(tempDir, "main.tonto"), sourceText);

    return tempDir;
}

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

describe("JSON generation errors", () => {
    it("should throw a semantic error when an attribute datatype cannot be resolved", () => {
        const project = new Project({ name: new MultilingualText("Test Project") });
        const model = project.createModel({ name: new MultilingualText("Test Model") });
        const order = model.createKind("Order");
        order.id = "Order";

        let thrownError: unknown;
        try {
            attributeGenerator(
                {
                    $type: "ClassDeclaration",
                    name: "Order",
                    attributes: [
                        {
                            $type: "Attribute",
                            name: "customerId",
                            attributeTypeRef: {
                                ref: undefined,
                                $refText: "CustomerId",
                            },
                            cardinality: undefined,
                            isOrdered: false,
                            isDerived: false,
                            isConst: false,
                        },
                    ],
                } as never,
                order,
                []
            );
        } catch (error) {
            thrownError = error;
        }

        expect(isJsonGenerationError(thrownError)).toBe(true);
        if (!isJsonGenerationError(thrownError)) {
            throw new Error("Expected a JsonGenerationError");
        }

        expect(thrownError.step).toBe(JSON_GENERATION_STEPS.attributeGeneration);
        expect(formatJsonGenerationErrorMessage(thrownError)).toContain("CustomerId");
        expect(formatJsonGenerationErrorMessage(thrownError)).toContain("Step: attribute generation");
    });

    it("should stop modular generation when the project has source validation errors", async () => {
        const tempDir = createTempProject(
            "package Main\nkind Person\n@material relation Person [1] -- worksAt -- [1] Organization\n"
        );

        let thrownError: unknown;
        try {
            await generateModularCommand(tempDir);
        } catch (error) {
            thrownError = error;
        }

        expect(isJsonGenerationError(thrownError)).toBe(true);
        if (!isJsonGenerationError(thrownError)) {
            throw new Error("Expected a JsonGenerationError");
        }

        const formattedMessage = formatJsonGenerationErrorMessage(thrownError);

        expect(thrownError.step).toBe(JSON_GENERATION_STEPS.documentValidation);
        expect(formattedMessage).toContain("Could not generate JSON because the Tonto sources contain syntax or linking errors.");
        expect(formattedMessage).toContain("Step: document validation");
        expect(formattedMessage).toContain("Source validation error");
        expect(formattedMessage).toContain("main.tonto");
    });

    it("should generate JSON when sources only have semantic validation errors", async () => {
        const tempDir = createTempProject(`
            package Main
            kind Person
            role Student specializes Person
            subkind Graduate specializes Student
        `);

        const generatedJsonPath = await generateModularCommand(tempDir);
        const generatedJson = JSON.parse(fs.readFileSync(generatedJsonPath ?? "", "utf8")) as {
            model: {
                contents: Array<{
                    contents?: Array<{
                        propertyAssignments?: Record<string, unknown> | null;
                    }>;
                }>;
            };
        };

        const mainPackage = generatedJson.model.contents.find((element) =>
            element.contents?.some((content) => content.propertyAssignments?.__tontoName === "Graduate")
        );
        expect(mainPackage).toBeDefined();
    });

    it("exports source names without duplicating label and description metadata", async () => {
        const tempDir = createTempProject(`
            package Main

            kind Person {
                label {
                    @en "Person"
                    @pt-br "Pessoa"
                }
                description {
                    @en "A human being."
                    @pt-br "Um ser humano."
                }
            }

            datatype Address {
                label {
                    @en "Address"
                    @pt-br "Endereco"
                }
                description {
                    @en "A postal address."
                    @pt-br "Um endereco postal."
                }
            }

            enum StudentStatus {
                label {
                    @en "Student Status"
                    @pt-br "Status do Estudante"
                }
                description {
                    @en "Possible enrollment states."
                    @pt-br "Possiveis estados de matricula."
                }
                Active, Inactive
            }
        `);

        const generatedJsonPath = await generateModularCommand(tempDir);
        const generatedJson = JSON.parse(fs.readFileSync(generatedJsonPath ?? "", "utf8")) as {
            model: {
                contents: Array<{
                    name: string;
                    contents?: Array<{
                        type: string;
                        id: string;
                        name?: string | Record<string, string> | null;
                        description?: string | Record<string, string> | null;
                        propertyAssignments?: Record<string, unknown> | null;
                    }>;
                }>;
            };
        };

        const mainPackage = generatedJson.model.contents.find((element) => element.name === "Main");
        const findElementBySourceName = (sourceName: string) => mainPackage?.contents?.find(
            (element) => element.propertyAssignments?.__tontoName === sourceName
        );
        const person = findElementBySourceName("Person");
        const address = findElementBySourceName("Address");
        const studentStatus = findElementBySourceName("StudentStatus");

        expect(person?.propertyAssignments).toMatchObject({
            __tontoName: "Person",
        });
        expect(person?.name).toEqual({
            en: "Person",
            "pt-br": "Pessoa",
        });
        expect(person?.description).toEqual({
            en: "A human being.",
            "pt-br": "Um ser humano.",
        });

        expect(address?.propertyAssignments).toMatchObject({
            __tontoName: "Address",
        });
        expect(address?.name).toEqual({
            en: "Address",
            "pt-br": "Endereco",
        });
        expect(address?.description).toEqual({
            en: "A postal address.",
            "pt-br": "Um endereco postal.",
        });

        expect(studentStatus?.propertyAssignments).toMatchObject({
            __tontoName: "StudentStatus",
        });
        expect(studentStatus?.name).toEqual({
            en: "Student Status",
            "pt-br": "Status do Estudante",
        });
        expect(studentStatus?.description).toEqual({
            en: "Possible enrollment states.",
            "pt-br": "Possiveis estados de matricula.",
        });
    });
});
