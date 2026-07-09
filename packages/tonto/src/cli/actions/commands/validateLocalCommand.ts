import { NodeFileSystem } from "langium/node";
import fs from "node:fs";
import path from "node:path";
import { Diagnostic } from "vscode-languageserver-types";
import { createTontoServices } from "../../../index.js";
import { buildFolderDocuments } from "../../utils/buildFolderDocuments.js";
import { readOrCreateDefaultTontoManifest } from "../../utils/readManifest.js";

export const validateCommandLocal = async (dirName: string): Promise<Diagnostic[] | undefined> => {
    const projectDirectory = path.resolve(dirName);
    if (!fs.existsSync(projectDirectory) || !fs.statSync(projectDirectory).isDirectory()) {
        throw new Error(`Project directory does not exist: ${projectDirectory}`);
    }

    const services = createTontoServices({ ...NodeFileSystem }).Tonto;
    const manifest = readOrCreateDefaultTontoManifest(dirName);
    const { documents } = await buildFolderDocuments(dirName, services, {
        manifest,
        validation: true,
    });

    return documents.all
        .flatMap((document) => document.diagnostics)
        .toArray()
        .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined);
};
