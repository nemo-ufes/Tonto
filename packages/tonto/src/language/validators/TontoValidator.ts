import { ClassDeclarationValidator } from "./ClassDeclarationValidator.js";
import { ComplexDataTypeValidator } from "./ComplexDataTypeValidator.js";
import { ContextModuleValidator } from "./ContextModuleValidator.js";
import { GeneralizationValidator } from "./GeneralizationValidator.js";
import { ModelValidator } from "./ModelValidator.js";
import { RelationMetaAttributeValidator } from "./RelationMetaAttributeValidator.js";
import { IndividualValidator } from "./IndividualValidator.js";
import type { TontoServices } from "../tonto-module.js";

export class TontoValidator {
    ContextModuleValidator = new ContextModuleValidator();
    ClassDeclarationValidator = new ClassDeclarationValidator();
    ModelValidator = new ModelValidator();
    GeneralizationValidator = new GeneralizationValidator();
    ComplexDataTypeValidator = new ComplexDataTypeValidator();
    RelationMetaAttributeValidator: RelationMetaAttributeValidator;
    IndividualValidator: IndividualValidator;

    constructor(services: TontoServices) {
        this.RelationMetaAttributeValidator = new RelationMetaAttributeValidator(services);
        this.IndividualValidator = new IndividualValidator(services);
    }
}
