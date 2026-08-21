import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, test } from "vitest";
import { createTpmProgram } from "../src/index.js";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcherPath = path.join(packageRoot, "bin", "cli.js");
const packageJsonPath = path.join(packageRoot, "package.json");

describe("TPM CLI", () => {
  beforeAll(async () => {
    await execFileAsync("npm", ["run", "build"], { cwd: packageRoot });
  });

  test("uses the package version and exposes dependency commands", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    const program = createTpmProgram();

    expect(program.version()).toBe(packageJson.version);
    expect(program.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["install", "add", "i", "uninstall"])
    );
  });

  test("packaged launcher invokes the CLI entry point", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    const versionResult = await execFileAsync(process.execPath, [launcherPath, "--version"]);
    const helpResult = await execFileAsync(process.execPath, [launcherPath, "--help"]);

    expect(versionResult.stdout.trim()).toBe(packageJson.version);
    expect(helpResult.stdout).toContain("Tonto Package Manager");
    expect(helpResult.stdout).toContain("add [options]");
    expect(helpResult.stdout).toContain("install [options]");
  });
});
