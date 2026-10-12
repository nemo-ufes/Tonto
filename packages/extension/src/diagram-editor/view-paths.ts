import path from "node:path";

export function namedViewPath(sourcePath: string, name?: string): string {
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const suffix = name ? `.${name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-")}` : "";
  return path.join(path.dirname(sourcePath), "views", `${stem}${suffix}.tontoview`);
}

/** Longest matching model stem disambiguates model names containing dots. */
export function inferViewSource(viewPath: string, modelNames: string[]): string | undefined {
  const directory = path.dirname(viewPath);
  if (path.basename(directory) !== "views") return undefined;
  const viewStem = path.basename(viewPath, ".tontoview");
  const candidates = modelNames.filter(name => name.endsWith(".tonto") &&
    (viewStem === name.slice(0, -6) || viewStem.startsWith(`${name.slice(0, -6)}.`)))
    .sort((a, b) => b.length - a.length);
  return candidates[0] ? path.join(path.dirname(directory), candidates[0]) : undefined;
}
