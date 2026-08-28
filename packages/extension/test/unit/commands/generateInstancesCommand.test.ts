import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandIds, commandPalletteIds } from "../../../src/commands/commandIds.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(currentDirectory, "../../..");

const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as {
    contributes: {
        commands: Array<{ command: string; title: string; category?: string }>
        configuration?: { properties?: Record<string, unknown> }
    }
};

const contributedCommands = new Map(packageJson.contributes.commands.map((entry) => [entry.command, entry]));

describe("Generate Instances command registration", () => {
    it("is contributed to package.json so it shows in the command palette", () => {
        expect(contributedCommands.get(CommandIds.generateInstances)).toEqual({
            command: "tonto.generateInstances",
            title: "Generate Instances (Alloy)",
            category: "Tonto",
        });
    });

    it("is listed alongside the other palette commands", () => {
        expect(commandPalletteIds).toContain(CommandIds.generateInstances);
    });

    it("keeps the context-menu variant out of package.json", () => {
        expect(contributedCommands.has(CommandIds.generateInstancesFromButton)).toBe(false);
    });

    // It generates instances to reason about the model, so it belongs with Validate Model
    // rather than with the transformations that produce artefacts.
    it("appears in the sidebar's Model group", () => {
        const mainSource = fs.readFileSync(path.join(extensionRoot, "src/extension/main.ts"), "utf8");
        const modelGroup = mainSource.slice(
            mainSource.indexOf("label: \"Model\""),
            mainSource.indexOf("label: \"Transformations\"")
        );

        expect(modelGroup).toContain(CommandIds.generateInstances);
    });
});

describe("Alloy server settings", () => {
    // The server is not bundled yet, so without these a user has no way to point at a build
    // and the command can only fail.
    it("declares where the Alloy server and Java live", () => {
        const properties = packageJson.contributes.configuration?.properties ?? {};

        expect(Object.keys(properties)).toEqual(
            expect.arrayContaining(["tonto.alloy.serverPath", "tonto.alloy.javaPath"])
        );
    });
});
