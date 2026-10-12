import { tontoGuidance } from "../cli/templates/rules/tonto-guidance.js";
import { ErrorMessages } from "../language/models/ErrorMessages.js";
import { OntologicalCategoryEnum } from "../language/models/OntologicalCategory.js";
import { RelationTypes } from "../language/models/RelationType.js";
import { allowedStereotypeRestrictedToMatches } from "../language/models/StereotypeUtils.js";

export const knowledge = {
  guide: { source: "Tonto grammar reference maintained in this repository", text: tontoGuidance },
  rules: { source: "Current validator error messages", rules: ErrorMessages },
  tables: { source: "Current validator stereotype and nature tables", classes: Object.values(OntologicalCategoryEnum),
    relations: Object.values(RelationTypes), allowedNatures: allowedStereotypeRestrictedToMatches },
  patterns: { source: "Examples validated by the current Tonto language services", examples: [
    { name: "Kind and subkind", source: "package Example\nkind Person\nsubkind Adult specializes Person" },
    { name: "Typed attributes", source: "package Example\nkind Person { age: number }" },
  ] },
};
export type KnowledgeName = keyof typeof knowledge;
