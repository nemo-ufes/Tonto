import path from "node:path";

export function isTontoSourceInDiagramScope(sourcePath: string, sourceScope: string): boolean {
    if (sourcePath === sourceScope) {
        return true;
    }

    if (path.extname(sourceScope).toLowerCase() === ".tonto") {
        return false;
    }

    const relativePath = path.relative(sourceScope, sourcePath);
    return relativePath !== ""
        && relativePath !== ".."
        && !relativePath.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relativePath);
}
