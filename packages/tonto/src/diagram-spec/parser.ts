import {
    TontoDiagramDirection,
    TontoDiagramIssue,
    TontoDiagramLayout,
    TontoDiagramParseResult,
    TontoDiagramPresentation,
    TontoDiagramRelationLayout,
    TontoDiagramSpec,
    TontoDiagramViewport
} from "./types.js";

const DEFAULT_PRESENTATION: TontoDiagramPresentation = {
    direction: "LR",
    stereotypes: true,
    attributes: true,
};

const DEFAULT_VIEWPORT: TontoDiagramViewport = {
    x: 0,
    y: 0,
    zoom: 1,
};

const DEFAULT_SPEC: Omit<TontoDiagramSpec, "title" | "source"> = {
    imports: [],
    filter: {
        include: [],
        relations: [],
        external: false,
        datatypes: true,
    },
    presentation: DEFAULT_PRESENTATION,
    nodes: [],
    relations: [],
    viewport: DEFAULT_VIEWPORT,
};

type BlockMatch = {
    body: string;
    endIndex: number;
    index: number;
};

type LineMatch = {
    value: string;
    index: number;
    length: number;
};

export function parseTontoDiagramSpec(sourceText: string): TontoDiagramParseResult {
    const issues: TontoDiagramIssue[] = [];
    const text = stripBlockComments(sourceText);
    const diagramMatch = text.match(/^([\s\S]*?)diagram\s+("([^"]+)"|'([^']+)')\s*\{([\s\S]*)\}\s*$/);

    if (!diagramMatch) {
        return {
            issues: [
                {
                    severity: "error",
                    message: 'Expected `diagram "Name" { ... }` root declaration.',
                    line: 1,
                },
            ],
        };
    }

    const title = diagramMatch[3] ?? diagramMatch[4] ?? "";
    const body = diagramMatch[5] ?? "";
    const sourceMatch = findLineValue(body, /(^|\n)\s*source\s+("([^"]+)"|'([^']+)')/);
    const importMatches = findLineValues(body, /(^|\n)\s*import\s+([A-Za-z_][\w.-]*)/g);
    const legacyModuleMatch = findLineValue(body, /(^|\n)\s*module\s+([A-Za-z_][\w.-]*)/);
    const includeMatches = [
        ...findLineValues(body, /(^|\n)\s*include\s+([^\n]+)/g),
        ...findLineValues(body, /(^|\n)\s*show\s+([A-Za-z_][\w.-]*)/g),
    ];
    const relationMatches = [
        ...findLineValues(body, /(^|\n)\s*relations\s+([^\n]+)/g),
        ...findLineValues(body, /(^|\n)\s*show\s+relation\s+([^\n]+)/g),
    ];
    const filterBlock = findNamedBlock(body, "filter");
    const presentationBlock = findNamedBlock(body, "presentation");
    const viewportBlock = findNamedBlock(body, "viewport");
    const nodeMatches = [...body.matchAll(/\bnode\s+([A-Za-z_][\w.-]*)\s*\{\s*x\s+(-?\d+(?:\.\d+)?)\s+y\s+(-?\d+(?:\.\d+)?)\s*\}/g)];
    const relationMatchesWithBody = [...body.matchAll(/\brelation\s+([A-Za-z_][\w.:-]*(?:::[A-Za-z_][\w.:-]*)*)\s*\{[^}]*\}/g)];

    const imports = dedupeAndSort([
        ...importMatches.map((match) => match.value),
        ...(legacyModuleMatch ? [legacyModuleMatch.value] : []),
    ]);

    const parsedSpec: TontoDiagramSpec = {
        title,
        source: sourceMatch?.value,
        imports,
        filter: {
            include: dedupeAndSort([
                ...includeMatches.flatMap((match) => splitCsv(match.value)),
                ...parseListSetting(filterBlock?.body, "include"),
            ]),
            relations: dedupeAndSort([
                ...relationMatches.flatMap((match) => splitCsv(match.value)),
                ...parseListSetting(filterBlock?.body, "relations"),
            ]),
            external: parseBooleanSetting(body, filterBlock?.body, "external", sourceText, filterBlock?.index, issues, DEFAULT_SPEC.filter.external),
            datatypes: parseBooleanSetting(body, filterBlock?.body, "datatypes", sourceText, filterBlock?.index, issues, DEFAULT_SPEC.filter.datatypes),
        },
        presentation: parsePresentation(body, presentationBlock?.body, sourceText, presentationBlock?.index, issues),
        nodes: parseNodeLayouts(nodeMatches, sourceText, issues),
        relations: parseRelationLayouts(relationMatchesWithBody, sourceText, issues),
        viewport: parseViewportBlock(viewportBlock, sourceText, issues),
    };

    const strayContent = getStrayContent(body, [
        sourceMatch ? sourceMatch.index : undefined,
        sourceMatch ? sourceMatch.index + sourceMatch.length : undefined,
        ...importMatches.flatMap((match) => [match.index, match.index + match.length]),
        legacyModuleMatch ? legacyModuleMatch.index : undefined,
        legacyModuleMatch ? legacyModuleMatch.index + legacyModuleMatch.length : undefined,
        ...includeMatches.flatMap((match) => [match.index, match.index + match.length]),
        ...relationMatches.flatMap((match) => [match.index, match.index + match.length]),
        ...findLineValues(body, /(^|\n)\s*(direction|stereotypes|attributes|external|datatypes)\s+[^\n]+/g)
            .flatMap((match) => [match.index, match.index + match.length]),
        ...findLineValues(body, /(^|\n)\s*theme\s+[^\n]+/g)
            .flatMap((match) => [match.index, match.index + match.length]),
        filterBlock?.index,
        filterBlock?.endIndex,
        presentationBlock?.index,
        presentationBlock?.endIndex,
        viewportBlock?.index,
        viewportBlock?.endIndex,
        ...nodeMatches.flatMap((match) => [match.index, match.index !== undefined ? match.index + match[0].length : undefined]),
        ...relationMatchesWithBody.flatMap((match) => [match.index, match.index !== undefined ? match.index + match[0].length : undefined]),
    ]);

    if (strayContent.trim().length > 0) {
        issues.push({
            severity: "warning",
            message: "Some diagram content could not be interpreted and will be ignored.",
            line: lineNumberForIndex(sourceText, diagramMatch.index ?? 0),
        });
    }

    return {
        spec: {
            ...DEFAULT_SPEC,
            ...parsedSpec,
        },
        issues,
    };
}

function parsePresentation(
    body: string,
    block: string | undefined,
    sourceText: string,
    blockIndex: number | undefined,
    issues: TontoDiagramIssue[]
): TontoDiagramPresentation {
    const directionValue = findLineValue(body, /(^|\n)\s*direction\s+([A-Z]{2})/)?.value
        ?? findLineValue(block ?? "", /(^|\n)\s*direction\s+([A-Z]{2})/)?.value
        ?? DEFAULT_PRESENTATION.direction;

    if (!isDirection(directionValue)) {
        issues.push({
            severity: "error",
            message: `Unsupported diagram direction \`${directionValue}\`.`,
            line: lineNumberForIndex(sourceText, blockIndex ?? 0),
        });
    }

    return {
        direction: isDirection(directionValue) ? directionValue : DEFAULT_PRESENTATION.direction,
        stereotypes: parseBooleanSetting(body, block, "stereotypes", sourceText, blockIndex, issues, DEFAULT_PRESENTATION.stereotypes),
        attributes: parseBooleanSetting(body, block, "attributes", sourceText, blockIndex, issues, DEFAULT_PRESENTATION.attributes),
    };
}

function parseRelationLayouts(
    matches: RegExpMatchArray[],
    sourceText: string,
    issues: TontoDiagramIssue[]
): TontoDiagramRelationLayout[] {
    const out = new Map<string, TontoDiagramRelationLayout>();

    for (const match of matches) {
        const target = match[1];
        if (out.has(target)) {
            issues.push({
                severity: "warning",
                message: `Relation entry \`${target}\` is duplicated; last value wins.`,
                line: lineNumberForIndex(sourceText, match.index ?? 0),
            });
        }
        out.set(target, { target });
    }

    return [...out.values()].sort((left, right) => left.target.localeCompare(right.target));
}

function parseNodeLayouts(
    matches: RegExpMatchArray[],
    sourceText: string,
    issues: TontoDiagramIssue[]
): TontoDiagramLayout[] {
    const layouts = new Map<string, TontoDiagramLayout>();

    for (const match of matches) {
        const target = match[1];
        const x = Number(match[2]);
        const y = Number(match[3]);

        if (Number.isNaN(x) || Number.isNaN(y)) {
            issues.push({
                severity: "error",
                message: `Invalid coordinates for node \`${target}\`.`,
                line: lineNumberForIndex(sourceText, match.index ?? 0),
            });
            continue;
        }

        if (layouts.has(target)) {
            issues.push({
                severity: "warning",
                message: `Node layout for \`${target}\` is duplicated; last value wins.`,
                line: lineNumberForIndex(sourceText, match.index ?? 0),
            });
        }

        layouts.set(target, {
            target,
            x,
            y,
        });
    }

    return [...layouts.values()].sort((left, right) => left.target.localeCompare(right.target));
}

function parseViewportBlock(
    block: BlockMatch | undefined,
    sourceText: string,
    issues: TontoDiagramIssue[]
): TontoDiagramViewport {
    if (!block) {
        return DEFAULT_VIEWPORT;
    }

    const match = block.body.match(/\bx\s+(-?\d+(?:\.\d+)?)\s+y\s+(-?\d+(?:\.\d+)?)\s+zoom\s+(-?\d+(?:\.\d+)?)/);

    if (!match) {
        issues.push({
            severity: "error",
            message: "Viewport must define `x`, `y`, and `zoom` values.",
            line: lineNumberForIndex(sourceText, block.index),
        });
        return DEFAULT_VIEWPORT;
    }

    const x = Number(match[1]);
    const y = Number(match[2]);
    const zoom = Number(match[3]);

    if ([x, y, zoom].some((value) => Number.isNaN(value))) {
        issues.push({
            severity: "error",
            message: "Viewport values must be numeric.",
            line: lineNumberForIndex(sourceText, block.index),
        });
        return DEFAULT_VIEWPORT;
    }

    return { x, y, zoom };
}

function parseBooleanSetting(
    body: string,
    block: string | undefined,
    setting: string,
    sourceText: string,
    blockIndex: number | undefined,
    issues: TontoDiagramIssue[],
    fallback: boolean
): boolean {
    const match = findLineValue(body, new RegExp(`(^|\\n)\\s*${setting}\\s+(true|false)`))
        ?? findLineValue(block ?? "", new RegExp(`(^|\\n)\\s*${setting}\\s+(true|false)`));

    if (!match) {
        return fallback;
    }

    const value = match.value.trim();
    if (value !== "true" && value !== "false") {
        issues.push({
            severity: "error",
            message: `Expected boolean value for \`${setting}\`.`,
            line: lineNumberForIndex(sourceText, (blockIndex ?? 0) + match.index),
        });
        return fallback;
    }

    return value === "true";
}

function parseListSetting(block: string | undefined, setting: string): string[] {
    return findLineValues(block ?? "", new RegExp(`(^|\\n)\\s*${setting}\\s+([^\\n]+)`, "g"))
        .flatMap((match) => splitCsv(match.value));
}

function splitCsv(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function dedupeAndSort(values: string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function findNamedBlock(input: string, name: string): BlockMatch | undefined {
    const blockStart = new RegExp(`\\b${name}\\s*\\{`, "g");
    const match = blockStart.exec(input);
    if (!match || match.index === undefined) {
        return undefined;
    }

    const braceIndex = input.indexOf("{", match.index);
    const endIndex = findMatchingBrace(input, braceIndex);
    if (endIndex < 0) {
        return undefined;
    }

    return {
        body: input.slice(braceIndex + 1, endIndex),
        endIndex: endIndex + 1,
        index: match.index,
    };
}

function findMatchingBrace(input: string, startIndex: number): number {
    let depth = 0;
    for (let index = startIndex; index < input.length; index += 1) {
        const char = input[index];
        if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function findLineValue(input: string, expression: RegExp): LineMatch | undefined {
    const matches = findLineValues(input, expression);
    return matches[0];
}

function findLineValues(input: string, expression: RegExp): LineMatch[] {
    const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
    const matcher = new RegExp(expression.source, flags);
    const matches: LineMatch[] = [];

    for (const match of input.matchAll(matcher)) {
        if (match.index === undefined) {
            continue;
        }

        let candidate: string | undefined;
        for (let index = match.length - 1; index >= 1; index -= 1) {
            if (match[index] !== undefined) {
                candidate = match[index];
                break;
            }
        }

        if (!candidate) {
            continue;
        }

        matches.push({
            value: candidate,
            index: match.index,
            length: match[0].length,
        });
    }

    return matches;
}

function getStrayContent(input: string, ranges: Array<number | undefined>): string {
    const normalizedRanges: Array<{ start: number; end: number }> = [];

    for (let index = 0; index < ranges.length; index += 2) {
        const start = ranges[index];
        const end = ranges[index + 1];
        if (start === undefined || end === undefined) {
            continue;
        }
        normalizedRanges.push({ start, end });
    }

    normalizedRanges.sort((left, right) => left.start - right.start);

    let cursor = 0;
    let result = "";
    for (const range of normalizedRanges) {
        if (range.start > cursor) {
            result += input.slice(cursor, range.start);
        }
        cursor = Math.max(cursor, range.end);
    }
    if (cursor < input.length) {
        result += input.slice(cursor);
    }
    return result.replace(/\/\/.*$/gm, "").trim();
}

function isDirection(value: string): value is TontoDiagramDirection {
    return value === "LR" || value === "RL" || value === "TB" || value === "BT";
}

function stripBlockComments(input: string): string {
    return input.replace(/\/\*[\s\S]*?\*\//g, "");
}

function lineNumberForIndex(input: string, index: number): number {
    return input.slice(0, index).split(/\r?\n/).length;
}
