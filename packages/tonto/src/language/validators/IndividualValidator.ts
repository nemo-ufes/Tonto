import type { ValidationAcceptor } from "langium";
import type {
  AttributeAssignment,
  ClassDeclaration,
  ContextModule,
  DataType,
  GeneralizationSet,
  Individual,
  IndividualValue,
  ObjectLiteral,
} from "../generated/ast.js";
import {
  isBooleanLiteral,
  isDataType,
  isEnumLiteral,
  isIndividual,
  isNumberLiteral,
  isObjectLiteral,
  isStringLiteral,
} from "../generated/ast.js";
import type { TontoServices } from "../tonto-module.js";
import {
  getIndividualAttributeBounds,
  getIndividualGeneralizations,
  getIndividualTypeHierarchy,
} from "../utils/individualAttributes.js";

export class IndividualValidator {
  constructor(private readonly services: TontoServices) {}

  checkIndividual(individual: Individual, accept: ValidationAcceptor): void {
    const type = individual.type?.ref;
    if (type) {
      this.checkAssignments(individual, type, getIndividualGeneralizations(this.services), accept);
    }
  }

  checkDuplicatedIndividualNames(contextModule: ContextModule, accept: ValidationAcceptor): void {
    const names = new Set<string>();
    for (const individual of contextModule.declarations.filter(isIndividual)) {
      const name = individual.name.toLowerCase();
      if (names.has(name)) {
        accept("error", `Duplicated individual declaration "${individual.name}".`, {
          node: individual,
          property: "name",
        });
      }
      names.add(name);
    }
  }

  private checkAssignments(
    owner: Individual | ObjectLiteral,
    type: ClassDeclaration | DataType,
    generalizations: GeneralizationSet[],
    accept: ValidationAcceptor
  ): void {
    const assignments = new Map<string, AttributeAssignment>();
    for (const assignment of owner.assignments) {
      if (!assignment.attribute) {
        continue;
      }
      const name = assignment.attribute.$refText.toLowerCase();
      if (assignments.has(name)) {
        accept("error", `Duplicated assignment for attribute "${assignment.attribute.$refText}".`, {
          node: assignment,
          property: "attribute",
        });
      } else {
        assignments.set(name, assignment);
      }
    }

    const hierarchy = getIndividualTypeHierarchy(type, generalizations);
    for (const attribute of hierarchy.flatMap((declaration) => declaration.attributes)) {
      const assignment = assignments.get(attribute.name.toLowerCase());
      const { lower, upper } = getIndividualAttributeBounds(attribute);
      if (!assignment) {
        if (lower > 0 && !attribute.isDerived) {
          const message = `Missing mandatory attribute "${attribute.name}" for "${type.name}".`;
          if (isIndividual(owner)) {
            accept("error", message, { node: owner, property: "name" });
          } else {
            accept("error", message, { node: owner });
          }
        }
        continue;
      }
      const count = assignment.values.length;
      if (count < lower || count > upper) {
        const expected = lower === upper ? `${lower}` : `${lower}..${upper === Infinity ? "*" : upper}`;
        accept("error", `Attribute "${attribute.name}" requires ${expected} value(s), but received ${count}.`, {
          node: assignment,
          property: "attribute",
        });
      }
      const datatype = attribute.attributeTypeRef?.ref;
      if (datatype) {
        for (const value of assignment.values) {
          this.checkValue(value, datatype, generalizations, accept);
        }
      }
    }
  }

  private checkValue(
    value: IndividualValue,
    datatype: DataType,
    generalizations: GeneralizationSet[],
    accept: ValidationAcceptor
  ): void {
    const hierarchy = getIndividualTypeHierarchy(datatype, generalizations);
    const enumerations = hierarchy.filter(isDataType).filter((type) => type.isEnum);
    if (enumerations.length > 0) {
      if (!isEnumLiteral(value)) {
        this.rejectValue(value, datatype, "an enum member", accept);
      }
      // Enum references are scoped to this datatype's members by TontoScopeProvider.
      return;
    }
    if (hierarchy.some((type) => type.attributes.length > 0)) {
      if (isObjectLiteral(value)) {
        this.checkAssignments(value, datatype, generalizations, accept);
      } else {
        this.rejectValue(value, datatype, "an object containing its attribute values", accept);
      }
      return;
    }
    const primitives = hierarchy.filter((type) =>
      isDataType(type) && type.$container.name === "Tonto.BasicDataTypes"
    );
    if (primitives.length === 0) {
      // An opaque datatype has no declared representation constraints.
      if (isObjectLiteral(value) || isEnumLiteral(value)) {
        this.rejectValue(value, datatype, "a string, number, or boolean literal", accept);
      }
      return;
    }
    for (const primitive of primitives) {
      const valid = primitive.name === "number"
        ? isNumberLiteral(value) && Number.isFinite(value.value)
        : primitive.name === "boolean"
          ? isBooleanLiteral(value)
          : ["string", "date", "time", "datetime"].includes(primitive.name) && isStringLiteral(value);
      if (!valid) {
        this.rejectValue(value, datatype, `a ${primitive.name} literal`, accept);
      }
    }
  }

  private rejectValue(value: IndividualValue, datatype: DataType, expected: string, accept: ValidationAcceptor): void {
    accept("error", `Invalid value for datatype "${datatype.name}": expected ${expected}.`, { node: value });
  }
}
