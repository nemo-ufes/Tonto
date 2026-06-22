import * as ast from "../generated/ast.js";
import { TontoNatures } from "../models/OntologicalCategory.js";

export type TontoNatureResult = {
    nature: TontoNatures;
    isKind: boolean;
}

function getSemanticTokenFromNature(nature: TontoNatureResult): string {
    switch (nature.nature) {
        case "objects":
            return "tontoObjects";
        case "functional-complexes":
            if (nature.isKind) return "tontoKind";
            return "tontoFunctionalComplex";
        case "relators":
            if (nature.isKind) return "tontoRelatorKind";
            return "tontoRelator";
        case "qualities":
            if (nature.isKind) return "tontoQualityKind";
            return "tontoQuality";
        case "quantities":
            if (nature.isKind) return "tontoQuantityKind";
            return "tontoQuantity";
        case "collectives":
            if (nature.isKind) return "tontoCollectiveKind";
            return "tontoCollective";
        case "modes":
            if (nature.isKind) return "tontoModeKind";
            return "tontoMode";
        case "events":
            return "tontoEvent";
        case "situations":
            return "tontoSituation";
        case "types":
            return "tontoType";
    }
    return "tontoNone";
}

function getTontoNature(container: ast.ClassDeclaration): TontoNatureResult {
    switch (container.classElementType.ontologicalCategory) {
        case "kind":
            return { nature: "functional-complexes", isKind: true };
        case "collective":
            return { nature: "collectives", isKind: true };
        case "quantity":
            return { nature: "quantities", isKind: true };
        case "relator":
            return { nature: "relators", isKind: true };
        case "quality":
            return { nature: "qualities", isKind: true };
        case "mode":
        case "intrinsicMode":
        case "extrinsicMode":
            return { nature: "modes", isKind: true };
        case "type":
        case "powertype":
            return { nature: "types", isKind: false };;

        case "event":
        case "process":
            return { nature: "events", isKind: false };
        case "situation":
            return { nature: "situations", isKind: false };

        // Base Sortals that specialize an ultimate sortal
        case "subkind":
        case "phase":
        case "role":
        case "historicalRole":
            if (container.specializationEndurants.length > 0) {
                let specializationNature: TontoNatures = "abstract-individuals";
                container.specializationEndurants.forEach(item => {
                    if (item.ref && item.ref.name !== container.name) {
                        specializationNature = getTontoNature(item.ref).nature;
                    }
                });
                return { nature: specializationNature, isKind: false };;
            }
            break;

        // Non Sortals
        case "category":
        case "mixin":
        case "phaseMixin":
        case "roleMixin":
        case "historicalRoleMixin":
            if (container.ontologicalNatures && container.ontologicalNatures?.natures.length > 0) {
                const firstNature = container.ontologicalNatures.natures[0];
                if (firstNature === "extrinsic-modes" || firstNature === "intrinsic-modes") {
                    return { nature: "modes", isKind: false };
                }
                return { nature: firstNature, isKind: false };
            } else if (container.specializationEndurants.length > 0) {
                let specializationNature: TontoNatures = "abstract-individuals";
                container.specializationEndurants.forEach(item => {
                    if (item.ref && item.ref.name !== container.name) {
                        specializationNature = getTontoNature(item.ref).nature;
                    }
                });
                return { nature: specializationNature, isKind: false };;
            }
    }
    return { nature: "none", isKind: false };
}

export const tontoNatureUtils = {
    getSemanticTokenFromNature,
    getTontoNature
};
