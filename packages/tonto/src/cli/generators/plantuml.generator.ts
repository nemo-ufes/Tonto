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
    /**
     * Group local elements inside a `package` box named after their owning module.
     * The focused/main package is never boxed. Defaults to true.
     */
    showPackageNames?: boolean;
    /** Group elements from external packages inside their own `package` box. Defaults to true. */
    groupExternalPackages?: boolean;
    /** Render class/datatype attributes. Defaults to true. */
    showAttributes?: boolean;
    /** Render relation cardinalities. Defaults to true. */
    showCardinalities?: boolean;
    /** Render relation names and inverseOf labels. Defaults to true. */
    showRelationNames?: boolean;
    /** Fill elements with their nature color. When false the diagram is monochrome. Defaults to true. */
    showColors?: boolean;
    /** Spacing between nodes and ranks. Defaults to "cozy". */
    spacing?: PlantUMLSpacing;
    /** Scale element boxes up according to how many relations connect to them. Defaults to true. */
    sizeByDegree?: boolean;
    layout?: PlantUMLLayoutVariant;
    orthogonal?: boolean;
    externalReferenceModules?: ContextModule[];
}

export type PlantUMLSpacing = "compact" | "cozy" | "spacious";

const spacingPresets: Record<PlantUMLSpacing, { nodesep: number; ranksep: number }> = {
    compact: { nodesep: 40, ranksep: 45 },
    cozy: { nodesep: 65, ranksep: 80 },
    spacious: { nodesep: 100, ranksep: 130 },
};

export interface PlantUMLNatureLegendEntry {
    color: string;
    label: string;
}

/**
 * Nature → color mapping rendered by the generator, exposed so the editor can
 * draw a matching legend. Kinds use the full tone; their subtypes use a lighter
 * tone of the same hue.
 */
export const plantUMLNatureLegend: PlantUMLNatureLegendEntry[] = [
    { color: COLORS.TEAL, label: "Object" },
    { color: COLORS.PINK, label: "Functional complex · Collective · Quantity" },
    { color: COLORS.GREEN, label: "Relator" },
    { color: COLORS.BLUE, label: "Quality · Mode" },
    { color: COLORS.YELLOW, label: "Event" },
    { color: COLORS.ORANGE, label: "Situation" },
    { color: COLORS.PURPLE, label: "Type (high-order)" },
    { color: COLORS.WHITE, label: "Abstract individual" },
    { color: COLORS.GREY, label: "Unspecified nature" },
];

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
    const sizeByDegree = options.sizeByDegree ?? true;
    const renderContext: PlantUMLRenderContext = {
        qualifyAllModules: contextModules.length > 1,
        includedModules: new Set(contextModules),
        focusedModule,
        aliases: new Map(),
        usedAliases: new Set(),
        showPackageNames: options.showPackageNames ?? true,
        groupExternalPackages: options.groupExternalPackages ?? true,
        showAttributes: options.showAttributes ?? true,
        showColors: options.showColors ?? true,
        relationDegrees: sizeByDegree ? computeRelationDegrees(contextModules) : new Map(),
    };

    const spacing = spacingPresets[options.spacing ?? "cozy"];

    let header = "@startuml\n";
    header += "set separator none\n";
    header += getPlantUMLLayoutDirectives(getPlantUMLLayoutVariant(options));
    header += "skinparam classAttributeIconSize 0\n";
    header += "hide empty members\n";
    header += `skinparam nodesep ${spacing.nodesep}\n`;
    header += `skinparam ranksep ${spacing.ranksep}\n`;
    header += "skinparam backgroundColor white\n";
    header += "hide circle\n";

    const externalElements = new Set<ClassDeclaration>();
    // Qualified names (e.g. "ufo::Entity") referenced but never resolved to an AST node.
    const externalLooseNames = new Set<string>();
    const generatedRelations = new Set<ElementRelation>();

    // Declarations and relations are buffered separately so that every element is
    // declared (and parented into its package box) BEFORE any relation references it.
    // Otherwise PlantUML implicitly creates the element at top level on first mention
    // and never moves it into its package container.
    let declarations = "";
    let relations = "";

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

                // Declarations, optionally grouped inside a package box.
                const boxed = isModuleBoxed(element, renderContext);
                if (boxed) {
                    declarations += `package ${quotePlantUMLName(element.name)} {\n`;
                }
                for (const decl of sortedClasses) {
                    declarations += generateClass(decl, element, renderContext);
                }
                for (const decl of others) {
                    if (isDataType(decl)) {
                        declarations += generateDataType(decl, element, renderContext);
                    }
                }
                if (boxed) {
                    declarations += "}\n";
                }

                // Relations and generalizations are buffered and emitted after every
                // declaration so cross-package edges connect already-parented elements.
                for (const decl of sortedClasses) {
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
                                    relations += `${getPlantUMLReference(parentName, renderContext)} ${arrow} ${getPlantUMLReference(childName, renderContext)}\n`;
                                }
                            } else if (parentRef.$refText) {
                                // If we don't have the ref, we assume it might be external or unresolved.
                                // If we want to be strict about "external", we might skip this if !showExternalReferences
                                // But usually $refText means it's not resolved in the AST, so it's likely external/missing.
                                if (options.showExternalReferences) {
                                    // Unresolved refs are treated as external
                                    const parentName = formatReferenceText(parentRef.$refText);
                                    recordLooseExternalName(externalLooseNames, parentName);
                                    const childName = getDeclarationDisplayName(decl, element, renderContext);
                                    relations += `${getPlantUMLReference(parentName, renderContext)} <|---- ${getPlantUMLReference(childName, renderContext)}\n`;
                                }
                            }
                        }
                    }
                    // Generate inline relations
                    if (decl.references) {
                        decl.references.forEach((ref) => {
                            relations += generateRelationOnce(ref, element, options, renderContext, generatedRelations, externalElements, externalLooseNames);
                        });
                    }
                }

                for (const decl of others) {
                    if (isElementRelation(decl)) {
                        relations += generateRelationOnce(decl, element, options, renderContext, generatedRelations, externalElements, externalLooseNames);
                    }
                }
            }
        }
    }

    traverse(model);

    if (focusedModule && options.showExternalReferences) {
        const externalReferenceModules = options.externalReferenceModules ?? getSiblingContextModules(focusedModule);
        for (const relation of getIncomingExternalRelations(focusedModule, externalReferenceModules)) {
            relations += generateRelationOnce(relation, focusedModule, options, renderContext, generatedRelations, externalElements, externalLooseNames);
        }
    }

    // External element declarations, grouped into their own package boxes when enabled.
    if (externalElements.size > 0 || externalLooseNames.size > 0) {
        declarations += "\n' External Elements\n";
        const fallbackModule = focusedModule ?? contextModules[0];
        const groupExternal = renderContext.groupExternalPackages;

        const resolvedByModule = new Map<ContextModule, ClassDeclaration[]>();
        for (const element of externalElements) {
            const list = resolvedByModule.get(element.$container) ?? [];
            list.push(element);
            resolvedByModule.set(element.$container, list);
        }

        // Unresolved references keyed by the package portion of their qualified name.
        const looseByModule = new Map<string, string[]>();
        for (const looseName of externalLooseNames) {
            const moduleName = stripElementName(looseName);
            if (!moduleName) {
                continue;
            }
            const list = looseByModule.get(moduleName) ?? [];
            list.push(looseName);
            looseByModule.set(moduleName, list);
        }

        if (groupExternal) {
            for (const [module, elements] of resolvedByModule) {
                declarations += `package ${quotePlantUMLName(module.name)} {\n`;
                for (const element of elements) {
                    declarations += generateClass(element, fallbackModule, renderContext);
                }
                declarations += "}\n";
            }
            for (const [moduleName, looseNames] of looseByModule) {
                declarations += `package ${quotePlantUMLName(moduleName)} {\n`;
                for (const looseName of looseNames) {
                    declarations += `class ${getPlantUMLDeclarationName(looseName, renderContext, true)}\n`;
                }
                declarations += "}\n";
            }
        } else {
            for (const element of externalElements) {
                declarations += generateClass(element, fallbackModule, renderContext);
            }
            for (const looseName of externalLooseNames) {
                declarations += `class ${getPlantUMLDeclarationName(looseName, renderContext, !renderContext.qualifyAllModules)}\n`;
            }
        }
    }

    return `${header}${declarations}${relations}@enduml`;
}

/** True when a module's elements should be wrapped in a `package` box. */
function isModuleBoxed(module: ContextModule, renderContext: PlantUMLRenderContext): boolean {
    if (module === renderContext.focusedModule) {
        // The focused/main package is the subject of the view and is never boxed.
        return false;
    }
    if (renderContext.includedModules.has(module)) {
        return renderContext.showPackageNames;
    }
    return renderContext.groupExternalPackages;
}

/** Whether an element from the given module should display its short, unqualified name. */
function shouldUseSimpleName(module: ContextModule | undefined, renderContext: PlantUMLRenderContext): boolean {
    if (!module) {
        return !renderContext.qualifyAllModules;
    }
    return module === renderContext.focusedModule
        || isModuleBoxed(module, renderContext)
        || !renderContext.qualifyAllModules;
}

function recordLooseExternalName(target: Set<string>, name: string): void {
    if (name.includes("::")) {
        target.add(name);
    }
}

/** Returns the package portion of a `Module::Element` name, or "" when there is none. */
function stripElementName(name: string): string {
    const separator = name.lastIndexOf("::");
    return separator > 0 ? name.slice(0, separator) : "";
}

interface PlantUMLRenderContext {
    qualifyAllModules: boolean;
    includedModules: Set<ContextModule>;
    focusedModule: ContextModule | undefined;
    aliases: Map<string, string>;
    usedAliases: Set<string>;
    showPackageNames: boolean;
    groupExternalPackages: boolean;
    showAttributes: boolean;
    showColors: boolean;
    relationDegrees: Map<ClassDeclaration, number>;
}

/** Counts how many relations and generalizations touch each class so hub nodes can be enlarged. */
function computeRelationDegrees(contextModules: ContextModule[]): Map<ClassDeclaration, number> {
    const degrees = new Map<ClassDeclaration, number>();
    const bump = (node: AstNode | undefined) => {
        if (node && isClassDeclaration(node)) {
            degrees.set(node, (degrees.get(node) ?? 0) + 1);
        }
    };

    for (const module of contextModules) {
        for (const declaration of module.declarations) {
            if (isClassDeclaration(declaration)) {
                for (const parentRef of declaration.specializationEndurants) {
                    bump(declaration);
                    bump(parentRef.ref);
                }
                for (const relation of declaration.references) {
                    bump(declaration);
                    bump(relation.secondEnd?.ref);
                }
            } else if (isElementRelation(declaration)) {
                bump(declaration.firstEnd?.ref);
                bump(declaration.secondEnd?.ref);
            }
        }
    }

    return degrees;
}

/** Number of non-breaking spaces padded on each side of a label to widen its box. */
function paddingForDegree(degree: number): number {
    if (degree >= 7) {
        return 8;
    }
    if (degree >= 5) {
        return 5;
    }
    if (degree >= 3) {
        return 3;
    }
    return 0;
}

function padLabel(label: string, pad: number): string {
    if (pad <= 0) {
        return label;
    }
    const spacer = " ".repeat(pad);
    return `${spacer}${label}${spacer}`;
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
    const useSimpleName = shouldUseSimpleName(element.$container, renderContext);
    const pad = paddingForDegree(renderContext.relationDegrees.get(element) ?? 0);
    let classDef = `class ${getPlantUMLDeclarationName(elementName, renderContext, useSimpleName, pad)}`;
    const stereotype = element.classElementType?.ontologicalCategory;
    if (stereotype) {
        classDef += ` <<${stereotype}>>`;
    }

    if (renderContext.showColors) {
        const color = getColor(element);
        if (color) {
            classDef += ` ${color}`;
        }
    }

    classDef += " {\n";

    if (renderContext.showAttributes && element.attributes) {
        for (const attr of element.attributes) {
            const typeName = getAttributeTypeLabel(attr.attributeTypeRef?.ref, attr.attributeTypeRef?.$refText, currentModule, renderContext);
            classDef += `  ${attr.name} : ${typeName}\n`;
        }
    }

    classDef += "}\n";
    return classDef;
}

/** Attribute type labels always use the short type name (e.g. `number`, not `Tonto.BasicDataTypes::number`). */
function getAttributeTypeLabel(
    element: DataTypeOrClassOrRelation | undefined,
    refText: string | undefined,
    currentModule: ContextModule | undefined,
    renderContext: PlantUMLRenderContext
): string {
    const typeName = getReferenceDisplayName(element, refText, currentModule, renderContext);
    return typeName ? stripModuleQualifier(typeName) : "Unknown";
}

function generateDataType(element: DataType, currentModule: ContextModule | undefined, renderContext: PlantUMLRenderContext): string {
    const elementName = getDeclarationDisplayName(element, currentModule, renderContext);
    const useSimpleName = shouldUseSimpleName(element.$container, renderContext);
    if (element.isEnum) {
        let enumDef = `enum ${getPlantUMLDeclarationName(elementName, renderContext, useSimpleName)} <<enum>> {\n`;
        if (element.elements) {
            for (const item of element.elements) {
                enumDef += `  ${item.name}\n`;
            }
        }
        enumDef += "}\n";
        return enumDef;
    }

    let classDef = `class ${getPlantUMLDeclarationName(elementName, renderContext, useSimpleName)} <<DataType>>`;
    classDef += " {\n";

    if (renderContext.showAttributes && element.attributes) {
        for (const attr of element.attributes) {
            const typeName = getAttributeTypeLabel(attr.attributeTypeRef?.ref, attr.attributeTypeRef?.$refText, currentModule, renderContext);
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
    externalElements?: Set<ClassDeclaration>,
    externalLooseNames?: Set<string>
): string {
    if (generatedRelations.has(element)) {
        return "";
    }

    generatedRelations.add(element);
    let relationDefinition = generateRelation(element, currentModule, options, renderContext, externalElements, externalLooseNames);

    const inverseRelation = element.inverseEnd?.ref;
    if (options.showExternalReferences && inverseRelation && !generatedRelations.has(inverseRelation)) {
        relationDefinition += generateRelationOnce(inverseRelation, currentModule, options, renderContext, generatedRelations, externalElements, externalLooseNames);
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
    externalElements?: Set<ClassDeclaration>,
    externalLooseNames?: Set<string>
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

    // Record unresolved external ends so they get a declaration inside a package box.
    if (externalLooseNames) {
        if (element.firstEnd && !element.firstEnd.ref && element.firstEnd.$refText) {
            recordLooseExternalName(externalLooseNames, sourceName);
        }
        if (element.secondEnd && !element.secondEnd.ref && element.secondEnd.$refText) {
            recordLooseExternalName(externalLooseNames, targetName);
        }
    }

    const showCardinalities = options.showCardinalities ?? true;
    const sourceCard = showCardinalities && element.firstCardinality ?
        (element.firstCardinality.upperBound !== undefined ? `"${element.firstCardinality.lowerBound}..${element.firstCardinality.upperBound}"` : `"${element.firstCardinality.lowerBound}"`) : "";
    const targetCard = showCardinalities && element.secondCardinality ?
        (element.secondCardinality.upperBound !== undefined ? `"${element.secondCardinality.lowerBound}..${element.secondCardinality.upperBound}"` : `"${element.secondCardinality.lowerBound}"`) : "";

    const relationName = (options.showRelationNames ?? true) ? getRelationLabel(element) : "";

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

    return `${getPlantUMLReference(sourceName, renderContext)} ${sourceCard} ${arrow} ${targetCard} ${getPlantUMLReference(targetName, renderContext)} ${relationName}\n`;
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

function getPlantUMLDeclarationName(name: string, renderContext: PlantUMLRenderContext, useSimpleName: boolean, pad = 0): string {
    // When an element is shown inside its package box (or is the focused package),
    // the label only needs the simple name. Otherwise we keep the `Module::`
    // qualifier so loose cross-package elements stay unambiguous.
    const displayName = padLabel(useSimpleName ? stripModuleQualifier(name) : name, pad);
    // A padded display name differs from the identity, so the element must carry an
    // alias (its code name) for references to keep resolving to the same node.
    const alias = pad > 0 ? ensureAlias(name, renderContext) : getPlantUMLAlias(name, renderContext);
    return alias ? `${alias} as ${quotePlantUMLName(displayName)}` : quotePlantUMLName(displayName);
}

function stripModuleQualifier(name: string): string {
    const separator = name.lastIndexOf("::");
    return separator >= 0 ? name.slice(separator + 2) : name;
}

function getPlantUMLReference(name: string, renderContext: PlantUMLRenderContext): string {
    return getPlantUMLAlias(name, renderContext) ?? quotePlantUMLName(name);
}

function getPlantUMLAlias(name: string, renderContext: PlantUMLRenderContext): string | undefined {
    const existingAlias = renderContext.aliases.get(name);
    if (existingAlias) {
        return existingAlias;
    }

    if (isSafePlantUMLIdentifier(name)) {
        return undefined;
    }

    return createAlias(name, renderContext);
}

/** Like getPlantUMLAlias but always returns an alias, even for otherwise-safe names. */
function ensureAlias(name: string, renderContext: PlantUMLRenderContext): string {
    return renderContext.aliases.get(name) ?? createAlias(name, renderContext);
}

function createAlias(name: string, renderContext: PlantUMLRenderContext): string {
    const baseAlias = toPlantUMLAlias(name);
    let alias = baseAlias;
    let suffix = 2;
    while (renderContext.usedAliases.has(alias)) {
        alias = `${baseAlias}_${suffix}`;
        suffix += 1;
    }

    renderContext.aliases.set(name, alias);
    renderContext.usedAliases.add(alias);
    return alias;
}

function isSafePlantUMLIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function toPlantUMLAlias(name: string): string {
    const normalized = name
        .replace(/[^A-Za-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!normalized) {
        return "plantuml_element";
    }

    return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
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
