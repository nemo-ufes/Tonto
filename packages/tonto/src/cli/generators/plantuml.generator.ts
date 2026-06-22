import type { AstNode } from "langium";
import {
    ClassDeclaration,
    ContextModule,
    DataType,
    DataTypeOrClassOrRelation,
    ElementRelation,
    isClassDeclaration,
    isContextModule,
    isDataType,
    isElementRelation,
    isModel,
    Model
} from "../../language/generated/ast.js";
import { getModelContextModules } from "../../language/utils/modelStatements.js";
import { tontoNatureUtils } from "../../language/utils/tontoNatureUtils.js";

const COLORS = {
    GREEN: "#99FF99",
    LIGHT_GREEN: "#D3FFD3",
    PINK: "#FF99A3",
    LIGHT_PINK: "#FFDADD",
    BLUE: "#70D7FF",
    LIGHT_BLUE: "#C0EDFF",
    TEAL: "#67C3CB",
    LIGHT_TEAL: "#DDEDEE",
    WHITE: "#FFFFFF",
    YELLOW: "#FCFCD4",
    ORANGE: "#FCE0C0",
    PURPLE: "#D3D3FC",
    GREY: "#E0E0E0"
};

const mainColorMap: Record<string, string> = {
    "objects": COLORS.TEAL,
    "functional-complexes": COLORS.PINK,
    "collectives": COLORS.PINK,
    "quantities": COLORS.PINK,
    "relators": COLORS.GREEN,
    "qualities": COLORS.BLUE,
    "modes": COLORS.BLUE,
    "events": COLORS.YELLOW,
    "situations": COLORS.ORANGE,
    "types": COLORS.PURPLE,
    "abstract-individuals": COLORS.WHITE,
    "none": COLORS.GREY
};

const alternativeColorMap: Record<string, string> = {
    "objects": COLORS.LIGHT_TEAL,
    "functional-complexes": COLORS.LIGHT_PINK,
    "collectives": COLORS.LIGHT_PINK,
    "quantities": COLORS.LIGHT_PINK,
    "relators": COLORS.LIGHT_GREEN,
    "qualities": COLORS.LIGHT_BLUE,
    "modes": COLORS.LIGHT_BLUE,
    "events": COLORS.YELLOW,
    "situations": COLORS.ORANGE,
    "types": COLORS.PURPLE,
    "abstract-individuals": COLORS.WHITE,
    "none": COLORS.GREY
};

function getColor(element: ClassDeclaration): string | undefined {
    const natureResult = tontoNatureUtils.getTontoNature(element);
    
    if (natureResult.nature === "none") {
        return COLORS.GREY;
    }

    if (natureResult.isKind) {
        return mainColorMap[natureResult.nature];
    } else {
        return alternativeColorMap[natureResult.nature];
    }
}

export interface PlantUMLOptions {
    showExternalReferences: boolean;
    layout?: PlantUMLLayoutVariant;
    orthogonal?: boolean;
    externalReferenceModules?: ContextModule[];
}

export type PlantUMLLayoutVariant =
    | "default"
    | "top-to-bottom"
    | "left-to-right"
    | "polyline"
    | "orthogonal"
    | "smetana"
    | "elk";

export type PlantUMLSource = Model | ContextModule | ContextModule[] | AstNode;

export function generatePlantUML(model: PlantUMLSource, options: PlantUMLOptions = { showExternalReferences: true, orthogonal: false }): string {
    const contextModules = getPlantUMLContextModules(model);
    const focusedModule = isContextModule(model) ? model : undefined;
    const renderContext: PlantUMLRenderContext = {
        qualifyAllModules: contextModules.length > 1,
        includedModules: new Set(contextModules),
    };

    let puml = "@startuml\n";
    puml += "set separator none\n";
    puml += getPlantUMLLayoutDirectives(getPlantUMLLayoutVariant(options));
    puml += "skinparam classAttributeIconSize 0\n";
    puml += "hide empty members\n";
    puml += "skinparam nodesep 50\n";
    puml += "skinparam ranksep 50\n";
    puml += "skinparam backgroundColor white\n";
    puml += "hide circle\n";

    const externalElements = new Set<ClassDeclaration>();
    const generatedRelations = new Set<ElementRelation>();

    function traverse(element: PlantUMLSource) {
        if (Array.isArray(element)) {
            for (const contextModule of element) {
                traverse(contextModule);
            }
        } else if (isModel(element)) {
            for (const contextModule of contextModules) {
                traverse(contextModule);
            }
        } else if (isContextModule(element)) {
            if (element.declarations) {
                // Sort declarations to improve layout: Roots first
                const classes = element.declarations.filter(isClassDeclaration);
                const others = element.declarations.filter(d => !isClassDeclaration(d));

                const sortedClasses = sortClasses(classes);

                for (const decl of sortedClasses) {
                    puml += generateClass(decl, element, renderContext);
                    // Generate generalizations
                    if (decl.specializationEndurants) {
                        for (const parentRef of decl.specializationEndurants) {
                            if (parentRef.ref) {
                                // Check if parent is in the same module or if we show external refs
                                const isExternal = parentRef.ref.$container !== element && !renderContext.includedModules.has(parentRef.ref.$container);
                                if (options.showExternalReferences || !isExternal) {
                                    if (isExternal && isClassDeclaration(parentRef.ref) && !renderContext.includedModules.has(parentRef.ref.$container)) {
                                        externalElements.add(parentRef.ref);
                                    }
                                    const arrow = isExternal ? "<|----" : "<|--";
                                    const parentName = getDeclarationDisplayName(parentRef.ref, element, renderContext);
                                    const childName = getDeclarationDisplayName(decl, element, renderContext);
                                    puml += `${quotePlantUMLName(parentName)} ${arrow} ${quotePlantUMLName(childName)}\n`;
                                }
                            } else if (parentRef.$refText) {
                                // If we don't have the ref, we assume it might be external or unresolved.
                                // If we want to be strict about "external", we might skip this if !showExternalReferences
                                // But usually $refText means it's not resolved in the AST, so it's likely external/missing.
                                if (options.showExternalReferences) {
                                    // Unresolved refs are treated as external
                                    const parentName = formatReferenceText(parentRef.$refText);
                                    const childName = getDeclarationDisplayName(decl, element, renderContext);
                                    puml += `${quotePlantUMLName(parentName)} <|---- ${quotePlantUMLName(childName)}\n`;
                                }
                            }
                        }
                    }
                    // Generate inline relations
                    if (decl.references) {
                        decl.references.forEach((ref) => {
                            puml += generateRelationOnce(ref, element, options, renderContext, generatedRelations, externalElements);
                        });
                    }
                }

                for (const decl of others) {
                    if (isElementRelation(decl)) {
                        puml += generateRelationOnce(decl, element, options, renderContext, generatedRelations, externalElements);
                    } else if (isDataType(decl)) {
                        puml += generateDataType(decl, element, renderContext);
                    }
                }
            }
        }
    }

    traverse(model);

    if (focusedModule && options.showExternalReferences) {
        const externalReferenceModules = options.externalReferenceModules ?? getSiblingContextModules(focusedModule);
        for (const relation of getIncomingExternalRelations(focusedModule, externalReferenceModules)) {
            puml += generateRelationOnce(relation, focusedModule, options, renderContext, generatedRelations, externalElements);
        }
    }

    // Generate external elements
    if (externalElements.size > 0) {
        puml += "\n' External Elements\n";
        for (const element of externalElements) {
            puml += generateClass(element, focusedModule ?? contextModules[0], renderContext);
        }
    }

    puml += "@enduml";
    return puml;
}

interface PlantUMLRenderContext {
    qualifyAllModules: boolean;
    includedModules: Set<ContextModule>;
}

function getPlantUMLContextModules(model: PlantUMLSource): ContextModule[] {
    if (Array.isArray(model)) {
        return model;
    }

    if (isModel(model)) {
        return getModelContextModules(model);
    }

    return isContextModule(model) ? [model] : [];
}

function getPlantUMLLayoutVariant(options: PlantUMLOptions): PlantUMLLayoutVariant {
    if (options.layout) {
        return options.layout;
    }

    return options.orthogonal ? "orthogonal" : "default";
}

function getPlantUMLLayoutDirectives(layout: PlantUMLLayoutVariant): string {
    switch (layout) {
        case "top-to-bottom":
            return "top to bottom direction\n";
        case "left-to-right":
            return "left to right direction\n";
        case "polyline":
            return "skinparam linetype polyline\n";
        case "orthogonal":
            return "skinparam linetype ortho\n";
        case "smetana":
            return "!pragma layout smetana\n";
        case "elk":
            return "!pragma layout elk\n";
        case "default":
        default:
            return "";
    }
}

function sortClasses(classes: ClassDeclaration[]): ClassDeclaration[] {
    // Simple heuristic: Classes with no specializations (roots) first
    // This helps PlantUML/Graphviz with the hierarchy layout
    const roots = classes.filter(c => c.specializationEndurants.length === 0);
    const children = classes.filter(c => c.specializationEndurants.length > 0);
    return [...roots, ...children];
}

function generateClass(element: ClassDeclaration, currentModule: ContextModule | undefined, renderContext: PlantUMLRenderContext): string {
    const elementName = getDeclarationDisplayName(element, currentModule, renderContext);
    let classDef = `class ${quotePlantUMLName(elementName)}`;
    const stereotype = element.classElementType?.ontologicalCategory;
    if (stereotype) {
        classDef += ` <<${stereotype}>>`;
    }

    const color = getColor(element);
    if (color) {
        classDef += ` ${color}`;
    }

    classDef += " {\n";

    if (element.attributes) {
        for (const attr of element.attributes) {
            const typeName = getReferenceDisplayName(attr.attributeTypeRef?.ref, attr.attributeTypeRef?.$refText, currentModule, renderContext) || "Unknown";
            classDef += `  ${attr.name} : ${typeName}\n`;
        }
    }

    classDef += "}\n";
    return classDef;
}

function generateDataType(element: DataType, currentModule: ContextModule | undefined, renderContext: PlantUMLRenderContext): string {
    const elementName = getDeclarationDisplayName(element, currentModule, renderContext);
    if (element.isEnum) {
        let enumDef = `enum ${quotePlantUMLName(elementName)} <<enum>> {\n`;
        if (element.elements) {
            for (const item of element.elements) {
                enumDef += `  ${item.name}\n`;
            }
        }
        enumDef += "}\n";
        return enumDef;
    }

    let classDef = `class ${quotePlantUMLName(elementName)} <<DataType>>`;
    classDef += " {\n";

    if (element.attributes) {
        for (const attr of element.attributes) {
            const typeName = getReferenceDisplayName(attr.attributeTypeRef?.ref, attr.attributeTypeRef?.$refText, currentModule, renderContext) || "Unknown";
            classDef += `  ${attr.name} : ${typeName}\n`;
        }
    }

    classDef += "}\n";
    return classDef;
}

function generateRelationOnce(
    element: ElementRelation,
    currentModule: ContextModule,
    options: PlantUMLOptions,
    renderContext: PlantUMLRenderContext,
    generatedRelations: Set<ElementRelation>,
    externalElements?: Set<ClassDeclaration>
): string {
    if (generatedRelations.has(element)) {
        return "";
    }

    generatedRelations.add(element);
    let relationDefinition = generateRelation(element, currentModule, options, renderContext, externalElements);

    const inverseRelation = element.inverseEnd?.ref;
    if (options.showExternalReferences && inverseRelation && !generatedRelations.has(inverseRelation)) {
        relationDefinition += generateRelationOnce(inverseRelation, currentModule, options, renderContext, generatedRelations, externalElements);
    }

    return relationDefinition;
}

function getIncomingExternalRelations(currentModule: ContextModule, externalReferenceModules: ContextModule[]): ElementRelation[] {
    const relations: ElementRelation[] = [];
    const seen = new Set<ElementRelation>();

    for (const module of externalReferenceModules) {
        if (module === currentModule) {
            continue;
        }

        for (const relation of getModuleRelations(module)) {
            if (!seen.has(relation) && shouldShowExternalRelationForModule(relation, currentModule)) {
                seen.add(relation);
                relations.push(relation);
            }
        }
    }

    return relations;
}

function getSiblingContextModules(currentModule: ContextModule): ContextModule[] {
    const model = currentModule.$container.$container;
    return isModel(model) ? getModelContextModules(model) : [];
}

function getModuleRelations(module: ContextModule): ElementRelation[] {
    const relations: ElementRelation[] = [];

    for (const declaration of module.declarations) {
        if (isElementRelation(declaration)) {
            relations.push(declaration);
        } else if (isClassDeclaration(declaration)) {
            relations.push(...declaration.references);
        }
    }

    return relations;
}

function shouldShowExternalRelationForModule(relation: ElementRelation, currentModule: ContextModule): boolean {
    return relationTouchesModule(relation, currentModule) || relationHasInverseInModule(relation, currentModule);
}

function relationTouchesModule(relation: ElementRelation, currentModule: ContextModule): boolean {
    return getRelationSourceModule(relation) === currentModule || getReferenceModule(relation.secondEnd.ref) === currentModule;
}

function relationHasInverseInModule(relation: ElementRelation, currentModule: ContextModule): boolean {
    const inverseRelation = relation.inverseEnd?.ref;
    return inverseRelation ? getRelationModule(inverseRelation) === currentModule : false;
}

function generateRelation(
    element: ElementRelation,
    currentModule: ContextModule,
    options: PlantUMLOptions,
    renderContext: PlantUMLRenderContext,
    externalElements?: Set<ClassDeclaration>
): string {
    let sourceName: string | undefined;
    let sourceContainer: ContextModule | undefined;

    if (element.firstEnd) {
        sourceName = getReferenceDisplayName(element.firstEnd.ref, element.firstEnd.$refText, currentModule, renderContext);
        sourceContainer = getReferenceModule(element.firstEnd.ref);
    } else if (isClassDeclaration(element.$container)) {
        // Inline relation, container is the source
        sourceName = getDeclarationDisplayName(element.$container, currentModule, renderContext);
        sourceContainer = element.$container.$container;
    }

    const target = element.secondEnd?.ref;
    const targetName = getReferenceDisplayName(target, element.secondEnd?.$refText, currentModule, renderContext);
    const targetContainer = getReferenceModule(target);
    const relationContainer = getRelationModule(element);

    if (!sourceName || !targetName) return "";

    // Check external references
    const isSourceExternal = sourceContainer && sourceContainer !== currentModule;
    const isTargetExternal = targetContainer && targetContainer !== currentModule;
    const isSourceOutsideRenderSet = sourceContainer && !renderContext.includedModules.has(sourceContainer);
    const isTargetOutsideRenderSet = targetContainer && !renderContext.includedModules.has(targetContainer);
    const isRelationOutsideRenderSet = relationContainer && !renderContext.includedModules.has(relationContainer);
    const isExternal = isSourceOutsideRenderSet || isTargetOutsideRenderSet || isRelationOutsideRenderSet;

    if (externalElements) {
        const sourceReference = element.firstEnd?.ref;
        if (isSourceExternal && sourceReference && isClassDeclaration(sourceReference) && !renderContext.includedModules.has(sourceReference.$container)) {
            externalElements.add(sourceReference);
        }
        if (isTargetExternal && target && isClassDeclaration(target)) {
            if (!renderContext.includedModules.has(target.$container)) {
                externalElements.add(target);
            }
        }
    }

    if (!options.showExternalReferences) {
        if (isExternal) {
            return "";
        }

        // If we have $refText and no ref, it's likely external or broken. Hide it to be safe?
        if ((!element.firstEnd?.ref && !isClassDeclaration(element.$container)) || !element.secondEnd?.ref) {
            return "";
        }
    }

    const sourceCard = element.firstCardinality ?
        (element.firstCardinality.upperBound !== undefined ? `"${element.firstCardinality.lowerBound}..${element.firstCardinality.upperBound}"` : `"${element.firstCardinality.lowerBound}"`) : "";
    const targetCard = element.secondCardinality ?
        (element.secondCardinality.upperBound !== undefined ? `"${element.secondCardinality.lowerBound}..${element.secondCardinality.upperBound}"` : `"${element.secondCardinality.lowerBound}"`) : "";

    const relationName = getRelationLabel(element);

    // Use longer arrows for external references to push them away.
    const dash = isExternal ? "----" : "--";

    let arrow = dash;
    if (element.isComposition) {
        arrow = `*${dash}`;
    } else if (element.isAggregation) {
        arrow = `o${dash}`;
    } else if (element.isCompositionInverted) {
        arrow = `${dash}*`;
    } else if (element.isAggregationInverted) {
        arrow = `${dash}o`;
    }

    return `${quotePlantUMLName(sourceName)} ${sourceCard} ${arrow} ${targetCard} ${quotePlantUMLName(targetName)} ${relationName}\n`;
}

function getReferenceDisplayName(
    element: DataTypeOrClassOrRelation | undefined,
    refText: string | undefined,
    currentModule: ContextModule | undefined,
    renderContext: PlantUMLRenderContext
): string | undefined {
    if (isClassDeclaration(element) || isDataType(element)) {
        return getDeclarationDisplayName(element, currentModule, renderContext);
    }

    if (element?.name) {
        return element.name;
    }

    return refText ? formatReferenceText(refText) : undefined;
}

function getDeclarationDisplayName(
    element: ClassDeclaration | DataType,
    currentModule: ContextModule | undefined,
    renderContext: PlantUMLRenderContext
): string {
    const module = element.$container;
    const shouldQualify = renderContext.qualifyAllModules || (currentModule !== undefined && module !== currentModule);
    return shouldQualify ? `${module.name}::${element.name}` : element.name;
}

function formatReferenceText(refText: string): string {
    if (refText.includes("::")) {
        return refText;
    }

    const lastPackageSeparator = refText.lastIndexOf(".");
    if (lastPackageSeparator <= 0 || lastPackageSeparator === refText.length - 1) {
        return refText;
    }

    return `${refText.slice(0, lastPackageSeparator)}::${refText.slice(lastPackageSeparator + 1)}`;
}

function quotePlantUMLName(name: string): string {
    return `"${name.replaceAll("\"", "\\\"")}"`;
}

function getRelationLabel(element: ElementRelation): string {
    const labels: string[] = [];

    if (element.name) {
        labels.push(`<back:WhiteSmoke>${element.name}</back>`);
    }

    const inverseName = element.inverseEnd?.$refText ?? getRelationDisplayName(element.inverseEnd?.ref);
    if (inverseName) {
        labels.push(`inverseOf ${inverseName}`);
    }

    return labels.length > 0 ? `: ${labels.join("\\n")} >` : "";
}

function getRelationDisplayName(element: ElementRelation | undefined): string | undefined {
    if (!element?.name) {
        return undefined;
    }

    const parent = element.$container;
    if (isClassDeclaration(parent)) {
        return `${parent.name}.${element.name}`;
    }
    if (isContextModule(parent)) {
        return element.firstEnd?.$refText ? `${element.firstEnd.$refText}.${element.name}` : element.name;
    }
    return element.name;
}

function getRelationSourceModule(element: ElementRelation): ContextModule | undefined {
    if (element.firstEnd) {
        return getReferenceModule(element.firstEnd.ref);
    }
    if (isClassDeclaration(element.$container)) {
        return element.$container.$container;
    }
    return undefined;
}

function getRelationModule(element: ElementRelation): ContextModule | undefined {
    const parent = element.$container;
    if (isContextModule(parent)) {
        return parent;
    }
    if (isClassDeclaration(parent)) {
        return parent.$container;
    }
    return undefined;
}

function getReferenceModule(element: DataTypeOrClassOrRelation | undefined): ContextModule | undefined {
    if (isClassDeclaration(element) || isDataType(element)) {
        return element.$container;
    }
    if (isElementRelation(element)) {
        return getRelationModule(element);
    }
    return undefined;
}
