import { AstNodeDescription, DefaultScopeProvider, MapScope, ReferenceInfo, Scope, ScopeOptions, StreamScope, stream } from "langium";
import { isAttributeAssignment, isDataType, isEnumLiteral } from "../generated/ast.js";
import type { TontoServices } from "../tonto-module.js";
import { getAssignmentOwnerType, getIndividualGeneralizations, getIndividualTypeHierarchy } from "../utils/individualAttributes.js";

/**
 * Resolves both local and global symbols case-insensitively.
 *
 * Tonto treats symbol lookup the same regardless of where the symbol comes from,
 * so the case-insensitive flag must be applied when layering local scopes and
 * when consulting the shared global index.
 */
export class TontoScopeProvider extends DefaultScopeProvider {
    constructor(private readonly services: TontoServices) {
        super(services);
    }

    override getScope(context: ReferenceInfo): Scope {
        const container = context.container;
        if (isAttributeAssignment(container) && context.property === "attribute") {
            const type = getAssignmentOwnerType(container);
            const attributes = type
                ? getIndividualTypeHierarchy(type, getIndividualGeneralizations(this.services))
                    .flatMap((declaration) => declaration.attributes)
                : [];
            return this.createScope(attributes.map((attribute) =>
                this.descriptions.createDescription(attribute, attribute.name)
            ));
        }
        if (isEnumLiteral(container) && context.property === "member") {
            const type = container.$container.attribute?.ref?.attributeTypeRef?.ref;
            const datatypes = type
                ? getIndividualTypeHierarchy(type, getIndividualGeneralizations(this.services)).filter(isDataType)
                : [];
            const descriptions = datatypes.flatMap((datatype) => datatype.elements.flatMap((element) => {
                const qualifiedType = this.services.references.QualifiedNameProvider.getQualifiedName(datatype);
                const names = new Set([element.name, `${datatype.name}.${element.name}`, `${qualifiedType}.${element.name}`]);
                return [...names].map((name) => this.descriptions.createDescription(element, name));
            }));
            return this.createScope(descriptions);
        }
        return super.getScope(context);
    }

    protected override createScope(
        elements: Iterable<AstNodeDescription>,
        outerScope?: Scope,
        options?: ScopeOptions
    ): Scope {
        return new StreamScope(stream(elements), outerScope, {
            ...options,
            caseInsensitive: true,
        });
    }

    protected override getGlobalScope(referenceType: string, _context: ReferenceInfo): Scope {
        return this.globalScopeCache.get(referenceType, () =>
            new MapScope(this.indexManager.allElements(referenceType), undefined, {
                caseInsensitive: true,
            })
        );
    }
}
