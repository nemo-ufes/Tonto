import { AstNode } from "langium";
import { ContextModule, Import, Model, Statement, isModel } from "../generated/ast.js";

export function getModelStatements(model: Model): Statement[] {
    return model.statements;
}

export function getModelImports(model: Model): Import[] {
    const imports: Import[] = [];
    for (const statement of getModelStatements(model)) {
        if (statement.import) {
            imports.push(statement.import);
        }
        if (statement.contextModule) {
            imports.push(...statement.contextModule.imports);
        }
    }
    return imports;
}

export function getModelContextModules(model: Model): ContextModule[] {
    return getModelStatements(model)
        .flatMap((statement) => statement.contextModule ? [statement.contextModule] : []);
}

export function getPrimaryContextModule(model: Model): ContextModule | undefined {
    return getModelContextModules(model)[0];
}

export function getPrimaryContextModuleOrThrow(model: Model): ContextModule {
    const contextModule = getPrimaryContextModule(model);
    if (!contextModule) {
        throw new Error("Expected model to declare a context module.");
    }
    return contextModule;
}

export function getOwningModel(node: AstNode): Model | undefined {
    let current: AstNode | undefined = node;
    while (current) {
        if (isModel(current)) {
            return current;
        }
        current = current.$container;
    }
    return undefined;
}
