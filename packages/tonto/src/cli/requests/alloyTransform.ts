import { generateUniqueId } from "../generators/utils/idGenerator.js";
import { Class, Ontouml2Alloy, Project, ServiceIssueSeverity } from "ontouml-js";
import { isJsonGenerationError } from "./jsonGeneration.js";

/**
 * This file is the only place in Tonto allowed to import `Ontouml2Alloy`.
 *
 * The transformation is under active development by NEMO researchers and its API is
 * expected to change. `run()` is typed as `{ result: any }`, so the concrete field names
 * it returns are not checked by the compiler. Both facts are contained here: the rest of
 * Tonto consumes `AlloyModelBundle` and never touches the raw result, so an upstream
 * change breaks this file and nothing else.
 */

/** An Alloy model produced from an OntoUML project, as a set of named modules. */
export interface AlloyModelBundle {
    /** Signatures and facts derived from the ontology's classes and relations. */
    mainModule: string
    /** World structure: the possible-worlds scaffolding the model is interpreted against. */
    worldStructureModule: string
    /** Ontological property axioms (rigidity, existential dependency, and so on). */
    ontologicalPropertiesModule: string
}

/**
 * An OntoUML class, paired with the name it goes by inside the Alloy model.
 *
 * The transformation derives Alloy identifiers by stripping spaces from the OntoUML name, so
 * "Pessoa Fisica" becomes `PessoaFisica` and the two can no longer be matched by equality.
 * Carrying both keeps a consumer able to show the modeller their own name, and to say what
 * kind of class it is — the generated `.als` keeps no trace of the stereotype.
 */
export interface OntologyClass {
    /** As it appears in the Alloy model. */
    alloyName: string
    /** As the modeller wrote it. */
    name: string
    /** `kind`, `phase`, `role`, `relator`, and so on. Absent if the class declares none. */
    stereotype?: string
}

/** A single Alloy module ready to be written to disk. */
export interface AlloyModule {
    /** File name stem, without the `.als` extension. */
    name: string
    content: string
}

export interface AlloyResultResponse {
    id?: string
    status?: number
    result: AlloyModelBundle
    /**
     * The ontology's classes, which the Alloy model alone cannot describe: it keeps the names
     * but not what each class is. A consumer that wants to tell a kind from a phase needs this.
     */
    ontology?: OntologyClass[]
}

export interface AlloyErrorInfo {
    code?: string
    description?: string
    severity?: string
    title?: string
}

export interface ErrorAlloyResultResponse {
    id?: string
    message?: string
    status?: number
    info: AlloyErrorInfo[]
}

/**
 * Module order matters: `main` imports the other two, so writing them together keeps the
 * generated project loadable by the Alloy Analyzer. Adding or renaming a module upstream
 * is absorbed here.
 */
export function getAlloyModules(bundle: AlloyModelBundle): AlloyModule[] {
    return [
        { name: "world_structure", content: bundle.worldStructureModule },
        { name: "ontological_properties", content: bundle.ontologicalPropertiesModule },
        { name: "main", content: bundle.mainModule },
    ];
}

function getAlloyErrorInfo(error: unknown): AlloyErrorInfo {
    if (error instanceof Error) {
        return {
            severity: "error",
            title: error.name,
            description: error.message,
        };
    }

    return {
        severity: "error",
        title: "Unexpected error",
        description: String(error),
    };
}

export function createAlloyErrorResponse(
    message: string,
    options: { error?: unknown; info?: AlloyErrorInfo[]; status?: number } = {}
): ErrorAlloyResultResponse {
    const info = options.info ?? getAlloyErrorInfos(options.error);

    return {
        id: generateUniqueId(),
        message,
        status: options.status ?? 500,
        info,
    };
}

export function formatAlloyErrorMessage(error: Partial<ErrorAlloyResultResponse> | undefined): string {
    const message = error?.message?.trim() || "Error transforming model";
    const details = (error?.info ?? [])
        .map((info) => info.description ?? info.title)
        .filter((detail): detail is string => Boolean(detail))
        .join("\n");

    return details ? `${message}\n${details}` : message;
}

function getElementLabel(element: { id?: string; getName?: () => string | null } | undefined): string {
    if (!element) {
        return "(unknown)";
    }

    return element.getName?.() || element.id || "(unknown)";
}

function getAlloyErrorInfos(error: unknown): AlloyErrorInfo[] {
    if (isJsonGenerationError(error)) {
        return error.info.map((info) => ({
            code: info.code,
            severity: info.severity,
            title: info.title,
            description: info.description,
        }));
    }

    return error ? [getAlloyErrorInfo(error)] : [];
}

function describeClassifierKind(classifier: Class): string {
    if (classifier.hasEnumerationStereotype()) {
        return "Enumeration";
    }

    if (classifier.hasDatatypeStereotype()) {
        return "Datatype";
    }

    return "Class";
}

/**
 * Pre-flight checks for the conditions that make the transformation throw.
 *
 * The transformer derives Alloy identifiers with `element.getName().replace(...)` and
 * dereferences relation ends without null checks, so a missing name surfaces as
 * `TypeError: Cannot read properties of null` with no indication of which element caused
 * it. Each check below was confirmed against the transformation to fail that way.
 *
 * Deliberately *not* checked, because the transformation handles them: unnamed relations
 * and unnamed generalization sets.
 */
export function validateProjectForAlloyTransform(project: Project): AlloyErrorInfo[] {
    const issues: AlloyErrorInfo[] = [];
    const rootModel = project.model;

    if (!rootModel) {
        issues.push({
            code: "missing_project_model",
            severity: "error",
            title: "Missing project model",
            description: "The generated OntoUML project has no root model package.",
        });
        return issues;
    }

    for (const classifier of project.getAllClasses()) {
        if (!classifier.getName()) {
            const kind = describeClassifierKind(classifier);
            issues.push({
                code: "missing_classifier_name",
                severity: "error",
                title: `Missing ${kind.toLowerCase()} name`,
                description: `${kind} "${classifier.id}" has no name. Alloy signature names are derived from element names.`,
            });
        }
    }

    for (const attribute of project.getAllAttributes()) {
        if (!attribute.getName()) {
            const owner = getElementLabel(attribute.container);
            issues.push({
                code: "missing_attribute_name",
                severity: "error",
                title: "Missing attribute name",
                description: `An attribute of "${owner}" has no name. Alloy field names are derived from attribute names.`,
            });
        }
    }

    for (const literal of project.getAllLiterals()) {
        if (!literal.getName()) {
            issues.push({
                code: "missing_literal_name",
                severity: "error",
                title: "Missing enumeration literal name",
                description: `Enumeration literal "${literal.id}" has no name.`,
            });
        }
    }

    for (const relation of project.getAllRelations()) {
        const sourceEnd = relation.properties?.[0];
        const targetEnd = relation.properties?.[1];

        if (!sourceEnd?.propertyType || !targetEnd?.propertyType) {
            issues.push({
                code: "missing_relation_endpoint_type",
                severity: "error",
                title: "Missing relation endpoint type",
                description: `Relation "${getElementLabel(relation)}" must have source and target types before Alloy transformation.`,
            });
        }
    }

    return issues;
}

/**
 * The classes of the project, keyed by the name the Alloy model uses.
 *
 * Mirrors the transformation's own naming rule rather than guessing at it: whitespace is
 * stripped, which is what `getNameNoSpaces` does upstream when it builds signature names.
 */
export function describeOntology(project: Project): OntologyClass[] {
    return project.getAllClasses()
        .map((classifier) => ({ classifier, name: classifier.getName() }))
        .filter((entry): entry is { classifier: Class; name: string } => Boolean(entry.name))
        .map(({ classifier, name }) => ({
            alloyName: name.replace(/\s/g, ""),
            name,
            stereotype: classifier.stereotype ?? undefined,
        }));
}

/**
 * Narrows the untyped `run()` payload into `AlloyModelBundle`.
 *
 * If upstream renames or drops a module, this returns `undefined` and the caller reports a
 * precise error instead of Tonto silently writing `undefined` into an `.als` file.
 */
function toAlloyModelBundle(result: unknown): AlloyModelBundle | undefined {
    if (typeof result !== "object" || result === null) {
        return undefined;
    }

    const candidate = result as Partial<Record<keyof AlloyModelBundle, unknown>>;
    const { mainModule, worldStructureModule, ontologicalPropertiesModule } = candidate;

    if (
        typeof mainModule !== "string"
        || typeof worldStructureModule !== "string"
        || typeof ontologicalPropertiesModule !== "string"
    ) {
        return undefined;
    }

    return { mainModule, worldStructureModule, ontologicalPropertiesModule };
}

export async function TransformTontoToAlloy(project: Project): Promise<AlloyResultResponse | ErrorAlloyResultResponse> {
    try {
        const validationIssues = validateProjectForAlloyTransform(project);
        if (validationIssues.length > 0) {
            return createAlloyErrorResponse(
                "Cannot transform model to Alloy because the generated OntoUML project is incomplete",
                { info: validationIssues, status: 400 }
            );
        }

        const service = new Ontouml2Alloy(project);
        const { result, issues } = service.run();

        const bundle = toAlloyModelBundle(result);
        if (!bundle) {
            return createAlloyErrorResponse("The Alloy transformation returned an unexpected result", {
                info: [
                    {
                        code: "unexpected_alloy_result",
                        severity: "error",
                        title: "Unexpected transformation result",
                        description:
                            "Expected mainModule, worldStructureModule and ontologicalPropertiesModule as strings. "
                            + "The ontouml-js Alloy API has likely changed; alloyTransform.ts needs updating.",
                    },
                ],
            });
        }

        // `issues` is declared by the transformation but not populated yet. Reported when
        // it starts carrying content, so upstream diagnostics reach the modeller for free.
        const reportedIssues = (issues ?? []).filter((issue) => issue.severity === ServiceIssueSeverity.ERROR);
        if (reportedIssues.length > 0) {
            return createAlloyErrorResponse("The Alloy transformation reported errors", {
                info: reportedIssues.map((issue) => ({
                    code: issue.code,
                    severity: issue.severity,
                    title: issue.title,
                    description: issue.description,
                })),
                status: 400,
            });
        }

        return {
            id: generateUniqueId(),
            result: bundle,
            ontology: describeOntology(project),
            status: 200,
        };
    } catch (error) {
        return createAlloyErrorResponse("Error while transforming model to Alloy", { error });
    }
}
