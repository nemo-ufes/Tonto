export * from "./cli/main.js";
export * from "./cli/requests/ontoumljsValidator.js";
export * from "./cli/requests/tontoGeneration.js";
export * from "./language/index.js";
export { Configuration } from "./utils/extensionConfig.js";

export * from "./cli/requests/gufoTransform.js";
export * from "./cli/requests/jsonGeneration.js";
export * from "./cli/requests/ontoumljsValidator.js";


export * from "./language/lsp/semantic-token-types.js";
export * from "./language/lsp/tonto-semantic-token-provider.js";
export * from "./language/lsp/tonto-language-server.js";
export * from "./diagram-spec/index.js";

import type { Model } from "./language/generated/ast.js";
import * as GrammarAST from "./language/generated/ast.js";

export * from "./cli/generators/plantuml.generator.js";
export { GrammarAST, Model };
