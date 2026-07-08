# Repository Guidelines

## Project Structure & Module Organization

Tonto is an npm-workspace TypeScript monorepo. `packages/tonto` contains the Langium grammar, language server, validators, generators, CLI, and most tests. `packages/extension` is the VS Code extension; `packages/webview` provides its React/Vite diagram UI. `packages/tpm` contains the package manager, while `packages/tonto-documentation` is the Next.js documentation site. The two `packages/sprotty-vscode*` workspaces provide vendored diagram integration. Sample ontologies live in `examples/`; images and extension metadata are under `packages/extension/data` and `syntaxes`.

## Build, Test, and Development Commands

Use Node.js 24+ for the complete workspace and install dependencies from the root:

```bash
npm install
npm run build          # Type-check and build all workspaces
npm run watch          # Rebuild packages during development
npm run lint           # Run workspace ESLint tasks
npm test               # Run the Vitest suite once
npm run coverage       # Produce Vitest coverage output
npm run docs:dev       # Start the documentation site
npm run docs:check     # Build-check the documentation site
```

Scope work with `--workspace`, for example `npm run build --workspace=tonto-cli`. After changing `packages/tonto/src/language/grammar`, run `npm run langium:generate`; do not hand-edit `src/language/generated`.

## Coding Style & Naming Conventions

TypeScript is strict and uses ES modules. Follow `.editorconfig`: UTF-8, LF endings, final newline, trimmed trailing whitespace, and two-space indentation. Prettier specifies semicolons, double quotes, ES5 trailing commas, and a 120-character line width. Use `PascalCase` for types/classes, `camelCase` for functions and variables, and descriptive kebab-case or established package naming for files. Run `npm run lint:fix` only when its broader formatting changes are intended.

## Testing Guidelines

Vitest discovers `**/test/**/*.test.ts`. Place tests beside the owning workspace’s `test/` tree and name them after behavior, such as `import-order.test.ts`. Add focused parser, validator, CLI, or webview coverage for changed behavior. No minimum coverage threshold is enforced; regressions still require a test. Run focused tests with `npx vitest run packages/tonto/test/path/to/file.test.ts`.

## Commit & Pull Request Guidelines

The `main` branch is protected: never push directly to it. Create a feature branch and merge changes through a pull request. History generally follows concise Conventional Commit subjects: `feat:`, `fix:`, `test(scope):`, `refactor(scope):`, and `chore(scope):`. Keep each commit limited to one logical change. Pull requests should explain the behavior and affected workspaces, link relevant issues, list verification commands, and include screenshots or recordings for extension, webview, or documentation UI changes. Call out regenerated language files and any compatibility or packaging impact.
