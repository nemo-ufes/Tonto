import { ClassStereotype, stereotypeUtils, natureUtils, OntologicalNature } from "ontouml-js";
import { OntologicalCategoryEnum } from "./OntologicalCategory.js";

type AllowedStereotypes = {
    [key in OntologicalCategoryEnum]: OntologicalNature[];
};

const allowedStereotypeRestrictedToMatches: AllowedStereotypes = {
    [OntologicalCategoryEnum.ABSTRACT]: [OntologicalNature.abstract],
    [OntologicalCategoryEnum.DATATYPE]: [OntologicalNature.abstract],
    [OntologicalCategoryEnum.ENUMERATION]: [OntologicalNature.abstract],

    [OntologicalCategoryEnum.EVENT]: [OntologicalNature.event],
    [OntologicalCategoryEnum.SITUATION]: [OntologicalNature.situation],

    [OntologicalCategoryEnum.CATEGORY]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.MIXIN]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.ROLE_MIXIN]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.PHASE_MIXIN]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.HISTORICAL_ROLE_MIXIN]: natureUtils.EndurantNatures,

    [OntologicalCategoryEnum.KIND]: [OntologicalNature.functional_complex],
    [OntologicalCategoryEnum.COLLECTIVE]: [OntologicalNature.collective],
    [OntologicalCategoryEnum.QUANTITY]: [OntologicalNature.quantity],
    [OntologicalCategoryEnum.RELATOR]: [OntologicalNature.relator],
    [OntologicalCategoryEnum.MODE]: [OntologicalNature.extrinsic_mode, OntologicalNature.intrinsic_mode],
    [OntologicalCategoryEnum.INTRINSIC_MODE]: [OntologicalNature.extrinsic_mode, OntologicalNature.intrinsic_mode],
    [OntologicalCategoryEnum.EXTRINSIC_MODE]: [OntologicalNature.extrinsic_mode, OntologicalNature.intrinsic_mode],
    [OntologicalCategoryEnum.QUALITY]: [OntologicalNature.quality],

    [OntologicalCategoryEnum.SUBKIND]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.ROLE]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.PHASE]: natureUtils.EndurantNatures,
    [OntologicalCategoryEnum.HISTORICAL_ROLE]: natureUtils.EndurantNatures,

    [OntologicalCategoryEnum.TYPE]: [OntologicalNature.type],

    [OntologicalCategoryEnum.CLASS]: [],
};

function isTontoModeUltimateSortal(stereotype: string): boolean {
    return stereotype === "intrinsicMode" || stereotype === "extrinsicMode";
}

function hasSortalStereotype(stereotype: string): boolean {
    if (isTontoModeUltimateSortal(stereotype)) {
        return true;
    }
    const classStereotype = getClassStereotype(stereotype);
    if (classStereotype) {
        return stereotypeUtils.isSortalClassStereotype(classStereotype);
    }
    return false;
}

function hasNonSortalStereotype(stereotype: string): boolean {
    const classStereotype = getClassStereotype(stereotype);
    if (classStereotype) {
        return stereotypeUtils.isNonSortalClassStereotype(classStereotype);
    }
    return false;
}

function isRigidStereotype(stereotype: string): boolean {
    if (isTontoModeUltimateSortal(stereotype)) {
        return true;
    }
    const classStereotype = getClassStereotype(stereotype);
    if (classStereotype) {
        return stereotypeUtils.isRigidClassStereotype(classStereotype);
    }
    return false;
}

function isSemiRigidStereotype(stereotype: string): boolean {
    const classStereotype = getClassStereotype(stereotype);
    if (classStereotype) {
        return stereotypeUtils.isSemiRigidClassStereotype(classStereotype);
    }
    return false;
}

function isAntiRigidStereotype(stereotype: string): boolean {
    const classStereotype = getClassStereotype(stereotype);
    if (classStereotype) {
        return stereotypeUtils.isAntiRigidClassStereotype(classStereotype);
    }
    return false;
}

function getClassStereotype(stereotype: string): ClassStereotype | undefined {
    switch (stereotype) {
        case "type":
            return ClassStereotype.TYPE;
        case "historicalRole":
            return ClassStereotype.HISTORICAL_ROLE;
        case "historicalRoleMixin":
            return ClassStereotype.HISTORICAL_ROLE_MIXIN;
        case "event":
            return ClassStereotype.EVENT;
        case "situation":
            return ClassStereotype.SITUATION;
        case "category":
            return ClassStereotype.CATEGORY;
        case "mixin":
            return ClassStereotype.MIXIN;
        case "roleMixin":
            return ClassStereotype.ROLE_MIXIN;
        case "phaseMixin":
            return ClassStereotype.PHASE_MIXIN;
        case "kind":
            return ClassStereotype.KIND;
        case "collective":
            return ClassStereotype.COLLECTIVE;
        case "quantity":
            return ClassStereotype.QUANTITY;
        case "relator":
            return ClassStereotype.RELATOR;
        case "quality":
            return ClassStereotype.QUALITY;
        case "mode":
            return ClassStereotype.MODE;
        case "subkind":
            return ClassStereotype.SUBKIND;
        case "role":
            return ClassStereotype.ROLE;
        case "phase":
            return ClassStereotype.PHASE;
        case "enumeration":
        case "enum":
            return ClassStereotype.ENUMERATION;
        case "datatype":
            return ClassStereotype.DATATYPE;
        case "abstract":
            return ClassStereotype.ABSTRACT;
    }
    return undefined;
}

export {
    allowedStereotypeRestrictedToMatches,
    hasSortalStereotype,
    hasNonSortalStereotype,
    getClassStereotype,
    isRigidStereotype,
    isAntiRigidStereotype,
    isSemiRigidStereotype,
};
