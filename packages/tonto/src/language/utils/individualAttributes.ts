import type { Attribute, AttributeAssignment, ClassDeclaration, DataType, GeneralizationSet } from "../generated/ast.js";
import { isClassDeclaration, isGeneralizationSet, isIndividual, isModel } from "../generated/ast.js";
import type { TontoServices } from "../tonto-module.js";

/** Generalization sets also introduce inheritance, even without an explicit `specializes` clause. */
export function getIndividualGeneralizations(services: TontoServices): GeneralizationSet[] {
  return services.shared.workspace.LangiumDocuments.all
    .flatMap((document) => {
      const model = document.parseResult.value;
      return isModel(model)
        ? model.statements.flatMap((statement) => statement.contextModule?.declarations.filter(isGeneralizationSet) ?? [])
        : [];
    })
    .toArray();
}

export function getIndividualTypeHierarchy(
  type: ClassDeclaration | DataType,
  generalizations: GeneralizationSet[]
): Array<ClassDeclaration | DataType> {
  const visited = new Set<ClassDeclaration | DataType>();
  const pending = [type];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const parent of current.specializationEndurants) {
      if (parent.ref) {
        pending.push(parent.ref);
      }
    }
    for (const generalization of generalizations) {
      if (!generalization.specificItems.some((specific) => specific.ref === current)) {
        continue;
      }
      const parent = generalization.generalItem.ref;
      if (isClassDeclaration(parent)) {
        pending.push(parent);
      }
    }
  }
  return [...visited];
}

export function getAssignmentOwnerType(assignment: AttributeAssignment): ClassDeclaration | DataType | undefined {
  const owner = assignment.$container;
  if (isIndividual(owner)) {
    return owner.type?.ref;
  }
  return owner.$container.attribute?.ref?.attributeTypeRef?.ref;
}

export function getIndividualAttributeBounds(attribute: Attribute): { lower: number; upper: number } {
  const cardinality = attribute.cardinality;
  if (!cardinality) {
    return { lower: 1, upper: 1 };
  }
  if (cardinality.lowerBound === "*") {
    return { lower: 0, upper: Infinity };
  }
  return {
    lower: cardinality.lowerBound,
    upper: cardinality.upperBound === "*" ? Infinity : cardinality.upperBound ?? cardinality.lowerBound,
  };
}
