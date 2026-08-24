import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CommandIds, commandPalletteIds } from "../../../src/commands/commandIds.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(currentDirectory, "../../../package.json"), "utf8")
) as { contributes: { commands: Array<{ command: string; title: string; category?: string }> } };

const contributedCommands = new Map(packageJson.contributes.commands.map((entry) => [entry.command, entry]));

describe("Alloy transformation command registration", () => {
    it("is contributed to package.json so it shows in the command palette", () => {
        expect(contributedCommands.get(CommandIds.transformToAlloy)).toEqual({
            command: "tonto.transformToAlloy",
            title: "Transform to Alloy",
            category: "Tonto",
        });
    });

    it("is listed alongside the other palette commands", () => {
        expect(commandPalletteIds).toContain(CommandIds.transformToAlloy);
    });

    // The *FromButton variant is invoked from the status bar and context menus, where a
    // folder is already known. Contributing it would list it in the palette, from where it
    // has no context to act on — the gUFO command follows the same split.
    it("keeps the context-menu variant out of package.json", () => {
        expect(contributedCommands.has(CommandIds.transformToAlloyFromButton)).toBe(false);
        expect(contributedCommands.has(CommandIds.transformTontoFromButton)).toBe(false);
    });

    it("does not collide with the gUFO transformation ids", () => {
        expect(CommandIds.transformToAlloy).not.toBe(CommandIds.transformTonto);
        expect(contributedCommands.get(CommandIds.transformTonto)?.title).toBe("Transform to GUFO");
    });
});
