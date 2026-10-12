import { describe, expect, test } from "vitest";
import {
    createEntireOntologyDiagramTemplate,
    getTontoDiagramProjectName,
} from "../../src/diagram-editor/tontodiagram-template.js";
import { isTontoSourceInDiagramScope } from "../../src/diagram-editor/tontodiagram-source-scope.js";

describe("whole ontology tontodiagram template", () => {
    test("creates an unrestricted project-wide diagram", () => {
        const template = createEntireOntologyDiagramTemplate("University Model");

        expect(template).toContain('diagram "University Model Ontology"');
        expect(template).toContain("datatypes true");
        expect(template).not.toContain("source ");
        expect(template).not.toContain("import ");
        expect(template).not.toContain("include ");
        expect(template).not.toContain("relations ");
    });

    test("normalizes a manifest name into a valid diagram title", () => {
        expect(createEntireOntologyDiagramTemplate('University\n"Core"')).toContain(
            'diagram "University \'Core\' Ontology"',
        );
    });

    test("prefers the manifest display name and falls back safely", () => {
        expect(
            getTontoDiagramProjectName(
                '{"displayName":"University Model","projectName":"university"}',
                "fallback",
            ),
        ).toBe("University Model");
        expect(getTontoDiagramProjectName("not-json", "fallback")).toBe("fallback");
    });

    test("refreshes a project-wide diagram for any nested Tonto source", () => {
        expect(isTontoSourceInDiagramScope("/workspace/src/people.tonto", "/workspace")).toBe(true);
        expect(isTontoSourceInDiagramScope("/other/people.tonto", "/workspace")).toBe(false);
        expect(isTontoSourceInDiagramScope("/workspace/src/people.tonto", "/workspace/src/people.tonto")).toBe(true);
        expect(isTontoSourceInDiagramScope("/workspace/src/other.tonto", "/workspace/src/people.tonto")).toBe(false);
    });
});
