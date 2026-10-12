import { ValidationChecks, ValidationRegistry } from "langium";
import { TontoAstType } from "./generated/ast.js";
import type { TontoServices } from "./tonto-module.js";

/**
 * Registry for validation checks.
 */
export class TontoValidationRegistry extends ValidationRegistry {
    constructor(services: TontoServices) {
        super(services);
        const validator = services.validation.TontoValidator;
        const checks: ValidationChecks<TontoAstType> = {
            ClassDeclaration: [
                validator.ClassDeclarationValidator.checkUltimateSortalSpecializeUltimateSortal,
                validator.ClassDeclarationValidator.checkRigidSpecializesAntiRigid,
                validator.ClassDeclarationValidator.checkDuplicatedReferenceNames,
                validator.ClassDeclarationValidator.checkCompatibleNatures,
                validator.ClassDeclarationValidator.checkClassWithoutStereotype,
                validator.ClassDeclarationValidator.checkGeneralizationSortality,
            ],
            ContextModule: [
                validator.IndividualValidator.checkDuplicatedIndividualNames,
                validator.ContextModuleValidator.checkDuplicatedClassName,
                validator.ContextModuleValidator.checkCircularSpecialization,
                validator.ContextModuleValidator.checkClassDeclarationShouldSpecializeUltimateSortal,
                validator.ContextModuleValidator.checkCompatibleNaturesOfBaseSortals,
                validator.ContextModuleValidator.checkSpecializationNatureRestrictions,
                // validator.ContextModuleValidator.checkRedundantNatures,
            ],
            GeneralizationSet: [
                validator.GeneralizationValidator.checkCircularGeneralization,
                validator.GeneralizationValidator.checkGeneralizationSetConsistency,
                validator.GeneralizationValidator.checkGeneralizationSortality,
                validator.GeneralizationValidator.checkRigidSpecializesAntiRigid,
                validator.GeneralizationValidator.checkGeneralizationDataType,
            ],
            DataType: [
                validator.ComplexDataTypeValidator.checkCompatibleNatures,
                validator.ComplexDataTypeValidator.checkSpecialization,
            ],
            RelationMetaAttribute: [
                validator.RelationMetaAttributeValidator.checkRelationEndOverrideUsesNamedEnd,
                validator.RelationMetaAttributeValidator.checkRelationEndDoesNotRedefineItself,
            ],
            Individual: [
                (individual, accept) => validator.IndividualValidator.checkIndividual(individual, accept),
            ],
        };
        this.register(checks, validator);
    }
}
