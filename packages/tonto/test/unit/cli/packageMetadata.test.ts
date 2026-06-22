import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PackageJson = {
    dependencies?: Record<string, string>
};

type PackageLockJson = {
    packages?: Record<string, PackageJson>
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, "../../..");
const workspaceRoot = path.resolve(packageRoot, "../..");

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readJsonObject(filePath: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isObjectRecord(parsed)) {
        throw new Error(`${filePath} is not a JSON object.`);
    }

    return parsed;
}

function readDependencyVersions(filePath: string, value: unknown): Record<string, string> | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (!isObjectRecord(value)) {
        throw new Error(`${filePath} has invalid dependencies metadata.`);
    }

    const dependencies: Record<string, string> = {};
    for (const [dependencyName, dependencyVersion] of Object.entries(value)) {
        if (typeof dependencyVersion !== "string") {
            throw new Error(`${filePath} has invalid dependency version metadata for ${dependencyName}.`);
        }
        dependencies[dependencyName] = dependencyVersion;
    }

    return dependencies;
}

function readPackageJson(filePath: string): PackageJson {
    const parsed = readJsonObject(filePath);

    return {
        dependencies: readDependencyVersions(filePath, parsed.dependencies),
    };
}

function readPackageLockJson(filePath: string): PackageLockJson {
    const parsed = readJsonObject(filePath);
    const packages = parsed.packages;
    if (packages === undefined) {
        return {};
    }

    if (!isObjectRecord(packages)) {
        throw new Error(`${filePath} has invalid packages metadata.`);
    }

    const packageMetadata: Record<string, PackageJson> = {};
    for (const [packagePath, metadata] of Object.entries(packages)) {
        if (!isObjectRecord(metadata)) {
            throw new Error(`${filePath} has invalid package metadata for ${packagePath}.`);
        }

        packageMetadata[packagePath] = {
            dependencies: readDependencyVersions(filePath, metadata.dependencies),
        };
    }

    return {
        packages: packageMetadata,
    };
}

describe("tonto-cli package metadata", () => {
    it("pins Langium and Chevrotain runtime dependencies used by the generated parser", () => {
        const packageJson = readPackageJson(path.join(packageRoot, "package.json"));
        const packageLockJson = readPackageLockJson(path.join(workspaceRoot, "package-lock.json"));
        const lockedPackage = packageLockJson.packages?.["packages/tonto"];

        expect(packageJson.dependencies).toMatchObject({
            chevrotain: "11.0.3",
            langium: "3.2.0",
            "langium-sprotty": "3.2.0",
        });
        expect(lockedPackage?.dependencies).toMatchObject(packageJson.dependencies ?? {});
    });
});
