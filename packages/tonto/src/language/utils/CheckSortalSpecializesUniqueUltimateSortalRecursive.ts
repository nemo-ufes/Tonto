import { ValidationAcceptor } from "langium";
import { ClassDeclaration, ClassDeclarationOrRelation, GeneralizationSet } from "../generated/ast.js";
import { ErrorMessages } from "../models/ErrorMessages.js";
import { isUltimateSortalOntoCategory } from "../models/OntologicalCategory.js";

const validateSortalSpecializesUniqueUltimateSortalRecursive = (
    actualElement: ClassDeclaration,
    UltimateSortalSpecializedSet: Set<string>,
    accept: ValidationAcceptor
): void => {
    const totalUltimateSortalSpecializations: Set<string> = checkSortalSpecializesUniqueUltimateSortalRecursive(
        actualElement,
        [],
        accept,
        UltimateSortalSpecializedSet
    );
    if (totalUltimateSortalSpecializations.size > 1) {
        accept("error", ErrorMessages.sortalSpecializesUniqueUltimateSortal, {
            node: actualElement,
            property: "name",
        });
    }
};

const checkSortalSpecializesUniqueUltimateSortalRecursive = (
    actualElement: ClassDeclaration | GeneralizationSet,
    genSets: GeneralizationSet[],
    accept: ValidationAcceptor,
    UltimateSortalSpecializedSet: Set<string>,
    visitedElements = new Set<ClassDeclaration | GeneralizationSet>()
): Set<string> => {
    if (UltimateSortalSpecializedSet.size >= 2) {
        return UltimateSortalSpecializedSet;
    }
    if (visitedElements.has(actualElement)) {
        return UltimateSortalSpecializedSet;
    }
    visitedElements.add(actualElement);
    /**
   * If the element is a ClassDeclaration, then we need to check its specialization items. And we need
   * also to check all generalization sets where this class is the specific
   */
    if (actualElement.$type === "ClassDeclaration") {
        actualElement.specializationEndurants.forEach((specializationItem) => {
            const specItem = specializationItem.ref;
            if (specItem) {
                const specCategory = specItem?.classElementType?.ontologicalCategory;
                const SpecifiedNatures = specItem?.ontologicalNatures?.natures.length ?? 0;
                if (isUltimateSortalOntoCategory(specCategory)) {
                    UltimateSortalSpecializedSet.add(specItem.name);
                } else if (SpecifiedNatures > 0) {
                    // totalUltimateSortalSpecialized += 1;
                }

                checkSortalSpecializesUniqueUltimateSortalRecursive(
                    specItem,
                    genSets,
                    accept,
                    UltimateSortalSpecializedSet,
                    visitedElements
                );
            }
        });
        const genSetsWithElement: GeneralizationSet[] = getGensetsWhereSpecific(actualElement.name, genSets);

        genSetsWithElement.forEach((genSet) => {
            checkSortalSpecializesUniqueUltimateSortalRecursive(
                genSet,
                genSets,
                accept,
                UltimateSortalSpecializedSet,
                visitedElements
            );
        });
    } else if (actualElement.$type === "GeneralizationSet") {
        /**
         * If the element is a GeneralizationSet, then we need to check the general element and go up from there
         */
        const generalItem: ClassDeclarationOrRelation | undefined = actualElement.generalItem.ref;
        if (!generalItem || generalItem.$type !== "ClassDeclaration") {
            return UltimateSortalSpecializedSet;
        }

        if (isUltimateSortalOntoCategory(generalItem?.classElementType?.ontologicalCategory)) {
            UltimateSortalSpecializedSet.add(generalItem.name);
        }

        generalItem.specializationEndurants.forEach((specializationItem) => {
            const specItem = specializationItem.ref;
            if (specItem) {
                if (isUltimateSortalOntoCategory(specItem?.classElementType?.ontologicalCategory)) {
                    UltimateSortalSpecializedSet.add(specItem.name);
                }
                checkSortalSpecializesUniqueUltimateSortalRecursive(
                    specItem,
                    genSets,
                    accept,
                    UltimateSortalSpecializedSet,
                    visitedElements
                );
            }
        });

        const genSetsWhereElementIsSpecific = getGensetsWhereSpecific(generalItem.name ?? "", genSets);

        genSetsWhereElementIsSpecific.forEach((genSet) => {
            checkSortalSpecializesUniqueUltimateSortalRecursive(
                genSet,
                genSets,
                accept,
                UltimateSortalSpecializedSet,
                visitedElements
            );
        });
    }
    return UltimateSortalSpecializedSet;
};

function getGensetsWhereSpecific(declaration: string, genSets: GeneralizationSet[]): GeneralizationSet[] {
    return genSets.filter((genSet) => {
        const specificItem = genSet.specificItems.find((specific) => specific.ref?.name === declaration);
        return specificItem ?? undefined;
    });
}

export { checkSortalSpecializesUniqueUltimateSortalRecursive, validateSortalSpecializesUniqueUltimateSortalRecursive };
