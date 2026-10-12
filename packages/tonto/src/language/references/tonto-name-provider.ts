
import { AstNode, DefaultNameProvider } from "langium";
import {
    ClassDeclaration,
    ContextModule,
    isAttribute,
    isClassDeclaration,
    isContextModule,
    isDataType,
    isElementRelation,
    isEnumElement,
    isGeneralizationSet,
    isIndividual,
} from "../generated/ast.js";

export function toQualifiedName(pack: ContextModule | ClassDeclaration, childName: string): string {
    return (
        (isContextModule(pack.$container) || isClassDeclaration(pack.$container)
            ? toQualifiedName(pack.$container, pack.name)
            : pack.name) +
        "." +
        childName
    );
}

export class TontoQualifiedNameProvider extends DefaultNameProvider {

    /**
   * @param qualifier if the qualifier is a `string`, simple string concatenation is done: `qualifier.name`.
   *      if the qualifier is a `Package` fully qualified name is created: `package1.package2.name`.
   * @param name simple name
   * @returns qualified name separated by `.`
   */
    getQualifiedName(node: AstNode): string | undefined {
        if (isElementRelation(node)) {
            if (!node.name) {
                return undefined;
            }
            const parent = node.$container;
            if (isClassDeclaration(parent)) {
                return toQualifiedName(parent, node.name);
            } else if (isContextModule(parent)) {
                const firstEndQualifier = node.firstEnd?.$refText;
                return firstEndQualifier ? `${firstEndQualifier}.${node.name}` : node.name;
            }
            return node.name;
        }
        if (isContextModule(node)) {
            return node.name;
        }
        if (
            isClassDeclaration(node) ||
            isIndividual(node) ||
            isAttribute(node) ||
            isGeneralizationSet(node) ||
            isDataType(node) ||
            isEnumElement(node)
        ) {
            const parent = node.$container;
            return `${parent.name}.${node.name}`;
        }
        return undefined;
    }


    override getName(node: AstNode): string | undefined {
        if (isElementRelation(node) || isContextModule(node) || isClassDeclaration(node) || isIndividual(node) || isAttribute(node) ||
            isGeneralizationSet(node) ||
            isDataType(node) ||
            isEnumElement(node)) {
            return node.name;
        }
        return undefined;
    }
}
