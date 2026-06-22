enum OntologicalCategoryEnum {
    CLASS = "class",
    TYPE = "type",
    HISTORICAL_ROLE = "historicalRole",
    HISTORICAL_ROLE_MIXIN = "historicalRoleMixin",
    EVENT = "event",
    SITUATION = "situation",
    CATEGORY = "category",
    MIXIN = "mixin",
    ROLE_MIXIN = "roleMixin",
    PHASE_MIXIN = "phaseMixin",
    KIND = "kind",
    COLLECTIVE = "collective",
    QUANTITY = "quantity",
    RELATOR = "relator",
    QUALITY = "quality",
    MODE = "mode",
    INTRINSIC_MODE = "intrinsicMode",
    EXTRINSIC_MODE = "extrinsicMode",
    SUBKIND = "subkind",
    ROLE = "role",
    PHASE = "phase",
    ENUMERATION = "enumeration",
    DATATYPE = "datatype",
    ABSTRACT = "abstract",
}

export type TontoNatures = 	"objects" | "functional-complexes" | "collectives"  
| "quantities" | "relators" | "modes" | "qualities" |"events" | "situations" 
| "types" | "abstract-individuals" | "none"

const UltimateSortalOntoCategories = [
    OntologicalCategoryEnum.KIND,
    OntologicalCategoryEnum.COLLECTIVE,
    OntologicalCategoryEnum.QUANTITY,
    OntologicalCategoryEnum.RELATOR,
    OntologicalCategoryEnum.QUALITY,
    OntologicalCategoryEnum.MODE,
    OntologicalCategoryEnum.INTRINSIC_MODE,
    OntologicalCategoryEnum.EXTRINSIC_MODE,
];

const BaseSortalOntoCategories = [
    OntologicalCategoryEnum.SUBKIND,
    OntologicalCategoryEnum.PHASE,
    OntologicalCategoryEnum.ROLE,
    OntologicalCategoryEnum.HISTORICAL_ROLE,
];

const NonSortalOntoCategories = [
    OntologicalCategoryEnum.CATEGORY,
    OntologicalCategoryEnum.MIXIN,
    OntologicalCategoryEnum.PHASE_MIXIN,
    OntologicalCategoryEnum.ROLE_MIXIN,
    OntologicalCategoryEnum.HISTORICAL_ROLE_MIXIN,
];

const RigidOntoCategories = [
    OntologicalCategoryEnum.KIND,
    OntologicalCategoryEnum.QUANTITY,
    OntologicalCategoryEnum.COLLECTIVE,
    OntologicalCategoryEnum.MODE,
    OntologicalCategoryEnum.INTRINSIC_MODE,
    OntologicalCategoryEnum.EXTRINSIC_MODE,
    OntologicalCategoryEnum.QUALITY,
    OntologicalCategoryEnum.RELATOR,
    OntologicalCategoryEnum.SUBKIND,
    OntologicalCategoryEnum.CATEGORY,
    OntologicalCategoryEnum.EVENT,
    OntologicalCategoryEnum.SITUATION,
    OntologicalCategoryEnum.TYPE,
    OntologicalCategoryEnum.ABSTRACT,
    OntologicalCategoryEnum.DATATYPE,
    OntologicalCategoryEnum.ENUMERATION,
];

const AntiRigidOntoCategories = [
    OntologicalCategoryEnum.ROLE,
    OntologicalCategoryEnum.ROLE_MIXIN,
    OntologicalCategoryEnum.HISTORICAL_ROLE,
    OntologicalCategoryEnum.HISTORICAL_ROLE_MIXIN,
    OntologicalCategoryEnum.PHASE,
    OntologicalCategoryEnum.PHASE_MIXIN,
];

const SortalOntoCategories = [...UltimateSortalOntoCategories, ...BaseSortalOntoCategories];

const allOntologicalCategories = [...SortalOntoCategories, ...RigidOntoCategories, ...AntiRigidOntoCategories];

function isSortalOntoCategory(stereotype: string): boolean {
    const ontologicalCategory = allOntologicalCategories.find((category) => category === stereotype);
    if (ontologicalCategory) {
        const categoryExists = SortalOntoCategories.find((category) => category === ontologicalCategory);
        if (categoryExists && categoryExists?.length > 0) {
            return true;
        }
    }
    return false;
}

function isUltimateSortalOntoCategory(stereotype: string): boolean {
    const ontologicalCategory = allOntologicalCategories.find((category) => category === stereotype);
    if (!ontologicalCategory) {
        return false;
    }
    const categoryExists = UltimateSortalOntoCategories.find((category) => category === ontologicalCategory);
    if (categoryExists && categoryExists?.length > 0) {
        return true;
    }
    return false;
}

function isBaseSortalOntoCategory(stereotype: string): boolean {
    const ontologicalCategory = allOntologicalCategories.find((category) => category === stereotype);
    if (!ontologicalCategory) {
        return false;
    }
    const categoryExists = BaseSortalOntoCategories.find((category) => category === ontologicalCategory);
    if (categoryExists && categoryExists?.length > 0) {
        return true;
    }
    return false;
}

function isNonSortalOntoCategory(stereotype: string): boolean {
    const ontologicalCategory = allOntologicalCategories.find((category) => category === stereotype);
    if (!ontologicalCategory) {
        return false;
    }
    const categoryExists = NonSortalOntoCategories.find((category) => category === ontologicalCategory);
    if (categoryExists && categoryExists?.length > 0) {
        return true;
    }
    return false;
}

function getOntologicalCategory(stereotype: string): OntologicalCategoryEnum | undefined {
    switch (stereotype) {
        case "class":
            return OntologicalCategoryEnum.CLASS;
        case "type":
            return OntologicalCategoryEnum.TYPE;
        case "historicalRole":
            return OntologicalCategoryEnum.HISTORICAL_ROLE;
        case "historicalRoleMixin":
            return OntologicalCategoryEnum.HISTORICAL_ROLE_MIXIN;
        case "event":
            return OntologicalCategoryEnum.EVENT;
        case "situation":
            return OntologicalCategoryEnum.SITUATION;
        case "category":
            return OntologicalCategoryEnum.CATEGORY;
        case "mixin":
            return OntologicalCategoryEnum.MIXIN;
        case "roleMixin":
            return OntologicalCategoryEnum.ROLE_MIXIN;
        case "phaseMixin":
            return OntologicalCategoryEnum.PHASE_MIXIN;
        case "kind":
            return OntologicalCategoryEnum.KIND;
        case "collective":
            return OntologicalCategoryEnum.COLLECTIVE;
        case "quantity":
            return OntologicalCategoryEnum.QUANTITY;
        case "relator":
            return OntologicalCategoryEnum.RELATOR;
        case "quality":
            return OntologicalCategoryEnum.QUALITY;
        case "mode":
            return OntologicalCategoryEnum.MODE;
        case "intrinsicMode":
            return OntologicalCategoryEnum.INTRINSIC_MODE;
        case "extrinsicMode":
            return OntologicalCategoryEnum.EXTRINSIC_MODE;
        case "subkind":
            return OntologicalCategoryEnum.SUBKIND;
        case "role":
            return OntologicalCategoryEnum.ROLE;
        case "phase":
            return OntologicalCategoryEnum.PHASE;
        case "enumeration":
            return OntologicalCategoryEnum.ENUMERATION;
        case "datatype":
            return OntologicalCategoryEnum.DATATYPE;
        case "abstract":
            return OntologicalCategoryEnum.ABSTRACT;

        default:
            return undefined;
    }
}

export {
    BaseSortalOntoCategories, OntologicalCategoryEnum, SortalOntoCategories, UltimateSortalOntoCategories, getOntologicalCategory, isBaseSortalOntoCategory,
    isNonSortalOntoCategory, isSortalOntoCategory,
    isUltimateSortalOntoCategory
};
