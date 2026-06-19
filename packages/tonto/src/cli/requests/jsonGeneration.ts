import { AstNode, AstUtils, DocumentValidator, LangiumDocument, LangiumDocuments } from "langium";
import path from "node:path";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver-types";

export const JSON_GENERATION_STEPS = {
    manifestLoading: "manifest loading",
    sourceLoading: "source loading",
    documentValidation: "document validation",
    projectCreation: "project creation",
    classGeneration: "class generation",
    attributeGeneration: "attribute generation",
    relationGeneration: "relation generation",
    generalizationSetGeneration: "generalization set generation",
    specializationGeneration: "specialization generation",
    instantiationGeneration: "instantiation generation",
    serialization: "serialization",
    fileWriting: "file writing",
} as const;

export type JsonGenerationStep = (typeof JSON_GENERATION_STEPS)[keyof typeof JSON_GENERATION_STEPS];

export type JsonGenerationErrorInfo = {
    code?: string;
    title: string;
    description: string;
    severity: "error";
    filePath?: string;
    line?: number;
    column?: number;
};

type CreateJsonGenerationErrorOptions = {
    error?: unknown;
    info?: JsonGenerationErrorInfo[];
    step: JsonGenerationStep;
};

const MAX_FORMATTED_ISSUES = 8;

export class JsonGenerationError extends Error {
    override readonly cause?: unknown;
    readonly info: JsonGenerationErrorInfo[];
    readonly step: JsonGenerationStep;

    constructor(message: string, step: JsonGenerationStep, info: JsonGenerationErrorInfo[], cause?: unknown) {
        super(message);
        this.name = "JsonGenerationError";
        this.step = step;
        this.info = info;
        this.cause = cause;
    }
}

export function isJsonGenerationError(value: unknown): value is JsonGenerationError {
    return value instanceof JsonGenerationError;
}

export function createJsonGenerationError(message: string, options: CreateJsonGenerationErrorOptions): JsonGenerationError {
    const info = [...(options.info ?? [])];

    if (!isJsonGenerationError(options.error) && options.error !== undefined && info.length === 0) {
        info.push(getJsonGenerationCauseInfo(options.error));
    }

    if (info.length === 0) {
        info.push({
            severity: "error",
            title: "Unexpected generation error",
            description: message,
        });
    }

    return new JsonGenerationError(message, options.step, info, options.error);
}

export function normalizeJsonGenerationError(
    error: unknown,
    message: string,
    step: JsonGenerationStep,
    info?: JsonGenerationErrorInfo[]
): JsonGenerationError {
    if (isJsonGenerationError(error)) {
        return error;
    }

    return createJsonGenerationError(message, {
        error,
        info,
        step,
    });
}

export function createJsonGenerationNodeInfo(
    node: AstNode,
    options: Omit<JsonGenerationErrorInfo, "severity" | "filePath" | "line" | "column">
): JsonGenerationErrorInfo {
    return {
        severity: "error",
        ...getNodeLocation(node),
        ...options,
    };
}

export function getJsonGenerationDiagnosticInfo(
    document: LangiumDocument,
    diagnostic: Diagnostic
): JsonGenerationErrorInfo {
    const excerpt = document.textDocument.getText(diagnostic.range).trim();
    const excerptSuffix = excerpt ? ` [${excerpt}]` : "";

    return {
        severity: "error",
        code: typeof diagnostic.code === "string" ? diagnostic.code : undefined,
        title: "Source validation error",
        description: `${diagnostic.message}${excerptSuffix}`,
        filePath: getDocumentPath(document),
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
    };
}

export function getJsonGenerationDiagnosticInfos(document: LangiumDocument): JsonGenerationErrorInfo[] {
    return (document.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
        .map((diagnostic) => getJsonGenerationDiagnosticInfo(document, diagnostic));
}

export function getJsonGenerationDocumentErrorInfos(documents: LangiumDocuments): JsonGenerationErrorInfo[] {
    return documents.all
        .flatMap((document) => getJsonGenerationDiagnosticInfos(document))
        .toArray();
}

export function getJsonGenerationDocumentBlockingErrorInfos(documents: LangiumDocuments): JsonGenerationErrorInfo[] {
    return documents.all
        .flatMap((document) => getJsonGenerationBlockingDiagnosticInfos(document))
        .toArray();
}

export function getJsonGenerationBlockingDiagnosticInfos(document: LangiumDocument): JsonGenerationErrorInfo[] {
    return (document.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
        .filter(isBlockingDiagnostic)
        .map((diagnostic) => getJsonGenerationDiagnosticInfo(document, diagnostic));
}

export function formatJsonGenerationErrorMessage(error: unknown): string {
    if (!isJsonGenerationError(error)) {
        if (error instanceof Error) {
            return error.message;
        }

        return String(error);
    }

    const lines = [error.message, `Step: ${error.step}`];
    const visibleIssues = error.info.slice(0, MAX_FORMATTED_ISSUES);

    visibleIssues.forEach((info, index) => {
        lines.push(`${index + 1}. ${formatJsonGenerationInfo(info)}`);
    });

    if (error.info.length > visibleIssues.length) {
        lines.push(`Additional issues: ${error.info.length - visibleIssues.length} more.`);
    }

    return lines.join("\n");
}

function formatJsonGenerationInfo(info: JsonGenerationErrorInfo): string {
    const location = formatInfoLocation(info);
    return `${info.title}: ${info.description}${location}`;
}

function formatInfoLocation(info: JsonGenerationErrorInfo): string {
    if (!info.filePath) {
        return "";
    }

    const fileName = path.basename(info.filePath);
    const line = info.line ? `:${info.line}` : "";
    const column = info.column ? `:${info.column}` : "";

    return ` (${fileName}${line}${column})`;
}

function isBlockingDiagnostic(diagnostic: Diagnostic): boolean {
    const code = getDiagnosticDataCode(diagnostic);
    return (
        code === DocumentValidator.LexingError ||
        code === DocumentValidator.ParsingError ||
        code === DocumentValidator.LinkingError
    );
}

function getDiagnosticDataCode(diagnostic: Diagnostic): unknown {
    const data = diagnostic.data;
    if (typeof data !== "object" || data === null || !("code" in data)) {
        return undefined;
    }
    return data.code;
}

function getDocumentPath(document: LangiumDocument): string {
    if (document.uri.scheme === "file") {
        return document.uri.fsPath;
    }

    return document.uri.path || document.uri.toString();
}

function getNodeLocation(node: AstNode): Pick<JsonGenerationErrorInfo, "filePath" | "line" | "column"> {
    try {
        const document = AstUtils.getDocument(node);
        return {
            filePath: getDocumentPath(document),
            line: node.$cstNode?.range.start.line !== undefined ? node.$cstNode.range.start.line + 1 : undefined,
            column: node.$cstNode?.range.start.character !== undefined ? node.$cstNode.range.start.character + 1 : undefined,
        };
    } catch {
        return {};
    }
}

function getJsonGenerationCauseInfo(error: unknown): JsonGenerationErrorInfo {
    if (error instanceof Error) {
        return {
            severity: "error",
            title: error.name,
            description: error.message,
        };
    }

    return {
        severity: "error",
        title: "Unexpected error",
        description: String(error),
    };
}
