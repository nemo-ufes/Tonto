export type TontoOntologySkillTemplateFile = {
    relativePath: string;
    content: string;
};

export const tontoOntologySkillTemplateFiles: readonly TontoOntologySkillTemplateFile[] = [
    {
        relativePath: "SKILL.md",
        content: `---
name: tonto-ontology
description: >
  Skill for working with Tonto, a textual DSL for OntoUML ontological modeling based on the Unified Foundational Ontology (UFO).
  Use this skill whenever the user is working with .tonto files, asks about OntoUML stereotypes, wants to create or extend
  an ontology, analyze ontology terminology, summarize a Tonto model, write ontology documentation, or anything related to
  conceptual modeling with UFO/OntoUML. Also trigger when you see keywords like "kind", "relator", "phase", "role", "genset",
  "specializes", "mediation", or any OntoUML/UFO terminology in the context of modeling.
---

# Tonto Ontology Modeling

Tonto is a textual modeling language for creating well-founded ontologies based on the Unified Foundational Ontology (UFO). It is the textual counterpart to OntoUML, bringing ontological rigor into a code-like syntax that supports version control, modularization, and automated processing.

## Task Routing

When working with a Tonto project, identify what the user needs and read the appropriate reference file:

| User Intent | Reference File |
|---|---|
| Create new classes, relations, extend the ontology | \`references/extending.md\` |
| Analyze or improve naming, terminology, consistency | \`references/terminology.md\` |
| Summarize or explain the ontology in natural language | \`references/summarization.md\` |
| Write labels, descriptions, JSDoc documentation | \`references/documentation.md\` |

For basic syntax questions, CLI usage, or project structure, the information below is sufficient.

**Important workflow rule:** Before executing any significant change, plan your approach step-by-step and present it to the user for confirmation. Only proceed after they approve or suggest modifications.

## Core Syntax Reference

### Package and Imports

Every \`.tonto\` file defines exactly one package. Imports come before the package declaration.

\`\`\`tonto
import core.persons
import core.organizations as orgs

package events.academic

// ... declarations ...
\`\`\`

A package is defined by its file, not its directory. The folder structure is organizational only.

### Class Declarations

\`\`\`tonto
<stereotype> <ClassName> (of <nature1>, <nature2>)? (specializes <Super1>, <Super2>)? (instanceOf <HigherOrderType>)? {
    label { @en "..." @pt-br "..." }
    description { @en "..." @pt-br "..." }
    // attributes
    // internal relations
}
\`\`\`

### Individuals

\`\`\`tonto
kind Man { name: string }
individual john: Man {
  name = "John Doe"
}
\`\`\`

The classifier after \`:\` must reference a class declaration of any stereotype. Supply every mandatory, non-derived attribute, including attributes inherited through specialization or generalization sets. No cardinality means \`[1]\`; optional and derived attributes may be omitted. Use lists for multiple values, unquoted enum members for enums, and nested assignment objects for structured datatypes. Unknown attributes, duplicate assignments, incorrect value types, and cardinality violations are errors. \`tonto-cli validate\` checks individuals; schema exports do not preserve them.

### Stereotypes

Choosing the correct stereotype is the most important modeling decision. It reflects the ontological nature of the concept according to UFO.

**Ultimate Sortals** (provide identity principle — every sortal must ultimately specialize one):

| Stereotype | Use When | Example |
|---|---|---|
| \`kind\` | Functional complex that provides identity | \`kind Person\`, \`kind Car\` |
| \`collective\` | Collection of similar members | \`collective Flock\` |
| \`quantity\` | Amount of matter | \`quantity WaterPortion\` |
| \`quality\` | Measurable characteristic (quale) | \`quality Color\`, \`quality Weight\` |
| \`mode\` | Intrinsic, non-measurable property | \`mode Skill\`, \`mode Belief\` |
| \`relator\` | Truth-maker of a material relation | \`relator Employment\`, \`relator Marriage\` |
| \`type\` | Higher-order type (instances are types) | \`type Species\` |
| \`powertype\` | All possible specializations of a base type | \`powertype CarModel\` |

**Sortals** (inherit identity from an ultimate sortal):

| Stereotype | Rigidity | Basis | Example |
|---|---|---|---|
| \`subkind\` | Rigid | Essential property | \`subkind Man specializes Person\` |
| \`phase\` | Anti-rigid | Intrinsic change | \`phase Child specializes Person\` |
| \`role\` | Anti-rigid | Relational context | \`role Student specializes Person\` |
| \`historicalRole\` | Anti-rigid | Event participation | \`historicalRole Veteran specializes Person\` |

**Non-Sortals** (classify instances across multiple kinds):

| Stereotype | Rigidity | Example |
|---|---|---|
| \`category\` | Rigid | \`category LivingBeing of objects\` |
| \`mixin\` | Semi-rigid | \`mixin Insurable of objects\` |
| \`phaseMixin\` | Anti-rigid (intrinsic) | \`phaseMixin DamagedItem of objects\` |
| \`roleMixin\` | Anti-rigid (relational) | \`roleMixin Customer of objects\` |
| \`historicalRoleMixin\` | Anti-rigid (event) | \`historicalRoleMixin FormerEmployee of objects\` |

**Perdurants:**

| Stereotype | Use When | Example |
|---|---|---|
| \`event\` | Something that happens | \`event Purchase\` |
| \`situation\` | State of affairs at a point in time | \`situation SystemOverload\` |
| \`process\` | Ongoing perdurant | \`process Manufacturing\` |

**Neutral:** \`class\` — use only when undecided; the editor will warn.

### Ontological Natures

For non-sortals, constrain what kinds of instances they can have:

\`\`\`tonto
category PhysicalObject of objects
roleMixin Borrowable of functional-complexes, collectives
\`\`\`

Available natures: \`objects\`, \`functional-complexes\`, \`collectives\`, \`quantities\`, \`relators\`, \`intrinsic-modes\`, \`extrinsic-modes\`, \`qualities\`, \`events\`, \`situations\`, \`types\`, \`abstract-individuals\`.

### Attributes

\`\`\`tonto
kind Person {
    name: string [1]
    age: number { derived }
    nicknames: string [*] { ordered }
    ssn: string [0..1] { const }
}
\`\`\`

Built-in types: \`string\`, \`number\`, \`boolean\`, \`date\`, \`time\`, \`datetime\`.

Cardinalities: \`[1]\` (default), \`[0..1]\`, \`[*]\` (= \`[0..*]\`), \`[1..*]\`, \`[2..5]\`.

Meta-properties: \`ordered\`, \`const\`, \`derived\`.

### Reserved Keywords — Cannot Be Used as Attribute Names

The following words are **reserved** in Tonto and **must not** be used as attribute or datatype field names. If you need to express a concept that would naturally use one of these words, prefix it with an underscore or choose a synonym.

**Declaration/stereotype keywords:**
\`kind\`, \`collective\`, \`quantity\`, \`quality\`, \`mode\`, \`relator\`, \`type\`, \`powertype\`, \`subkind\`, \`phase\`, \`role\`, \`historicalRole\`, \`category\`, \`mixin\`, \`phaseMixin\`, \`roleMixin\`, \`historicalRoleMixin\`, \`event\`, \`situation\`, \`process\`, \`class\`, \`datatype\`, \`enum\`, \`relation\`, \`genset\`, \`intrinsicMode\`, \`extrinsicMode\`

**Structural keywords:**
\`label\`, \`description\`, \`specializes\`, \`instanceOf\`, \`of\`, \`import\`, \`package\`, \`disjoint\`, \`complete\`, \`general\`, \`specifics\`, \`categorizer\`, \`where\`, \`inverseOf\`

**Common pitfalls and fixes:**

| Intended name | Problem | Fix |
|---|---|---|
| \`description\` | Reserved (class description block) | \`_description\`, \`summary\`, or \`details\` |
| \`value\` | Conflicts with internal usage | \`_value\`, \`amount\`, or \`measure\` |
| \`role\` | Reserved (stereotype keyword) | \`_role\`, \`participationRole\`, or \`function\` |
| \`type\` | Reserved (stereotype keyword) | \`_type\`, \`category\`, or \`classification\` |
| \`label\` | Reserved (label block keyword) | \`_label\`, \`displayName\`, or \`title\` |
| \`class\` | Reserved (stereotype keyword) | \`_class\`, \`category\`, or \`classification\` |

**Example:**
\`\`\`tonto
// BAD — will cause parse errors:
kind Metric {
    value: number        // "value" conflicts with reserved usage
    description: string  // "description" is a reserved block keyword
}

// GOOD — use prefixed or alternative names:
kind Metric {
    _value: number
    summary: string
}
\`\`\`

### Datatypes and Enumerations

\`\`\`tonto
datatype Address {
    street: string
    city: string
    zipCode: string [0..1]
}

enum EyeColor { Blue, Green, Brown, Black }
\`\`\`

### Relations

**Connectors:**
- \`--\` : general association
- \`<>--\` : aggregation (shared part-whole, diamond at source)
- \`<o>--\` : composition (exclusive part-whole, diamond at source)

**Relation stereotypes** (prefix with \`@\`): \`@mediation\`, \`@componentOf\`, \`@memberOf\`, \`@subCollectionOf\`, \`@material\`, \`@formal\`, \`@characterization\`, \`@instantiation\`, \`@termination\`, \`@participational\`, \`@participation\`, \`@historicalDependence\`, \`@creation\`, \`@manifestation\`, \`@bringsAbout\`, \`@triggers\`, \`@externalDependence\`, \`@subQuantityOf\`.

**Internal relations** (inside a class body — the class is the source):

\`\`\`tonto
kind University {
    @componentOf [1] <o>-- hasDepartments -- [1..*] Department
}

relator Employment {
    @mediation [1..*] -- [1] Employee
    @mediation [1..*] -- [1] Employer
}
\`\`\`

**External relations:**

\`\`\`tonto
@material relation Person [0..*] -- enrolledIn -- [0..*] Course
\`\`\`

**End meta-attributes:**

\`\`\`tonto
({ ordered, subsets previousContracts } formerContracts)
\`\`\`

### Generalization Sets

**Short syntax:**
\`\`\`tonto
disjoint complete genset PersonPhases where Child, Teenager, Adult specializes Person
\`\`\`

**Expanded syntax (with categorizer):**
\`\`\`tonto
type PersonAgePhaseType
disjoint complete genset PhasesOfPerson {
    general Person
    categorizer PersonAgePhaseType
    specifics Child, Teenager, Adult
}
\`\`\`

- \`disjoint\`: instance of superclass can belong to at most one subclass in the set.
- \`complete\`: instance of superclass must belong to at least one subclass in the set.
- Both together = partition.

### Multi-Level Modeling

**Powertype** (all possible specializations of a base type):
\`\`\`tonto
powertype CarModel specializes Car
subkind Sedan (instanceOf CarModel) specializes Car
subkind SUV (instanceOf CarModel) specializes Car
\`\`\`

**Type** (higher-order classifier):
\`\`\`tonto
type Species
kind Dog (instanceOf Species)
kind Cat (instanceOf Species)
\`\`\`
`,
    },
    {
        relativePath: "references/documentation.md",
        content: `# Writing Effective Ontology Documentation

This guide covers how to write labels, descriptions, and JSDoc block comments for elements in a Tonto ontology. Good documentation explains not just *what* something is, but *why* it was modeled the way it was.

## Core Principles

- **Clarity and Conciseness**: Straightforward language. Explain technical terms when used.
- **User-Centricity**: Help the reader understand what a concept means and how it fits the broader model.
- **Ontological Rigor**: Accurately reflect the commitments made by the chosen stereotype.
- **Consistency**: Apply standards uniformly.

## Labels

Labels are the primary human-readable identifier. Keep them short (1-3 words), in PascalCase for classes.

Always provide both English and Brazilian Portuguese:

\`\`\`tonto
label {
    @en "Class Feature"
    @pt-br "Caracteristica de Classe"
}
\`\`\`

## Descriptions

Descriptions explain what the concept is within its domain. Contextualize with domain-specific references when helpful.

\`\`\`tonto
description {
    @en "A special ability, trait, or proficiency granted by an adventuring class, often at a specific level."
    @pt-br "Uma habilidade especial, traco ou proficiencia concedida por uma classe de aventureiro, frequentemente em um nivel especifico."
}
\`\`\`

## JSDoc Block Comments

The \`/** ... */\` comment is where you explain the *ontological* choices — the "why", not just the "what". Do not repeat information from labels or descriptions.

### Structure

1. **High-level summary** (1 sentence, optional but recommended)
2. **OntoUML stereotype explanation**: State the stereotype, explain *why* it was chosen, describe implications
3. **Relationships and constraints**: Critical connections to other elements
4. **Usage example** (optional)

### Stereotype Explanation Templates

- **\`kind\`**: "This is a \`kind\` because it provides a principle of identity for its instances. An instance of X cannot stop being an X without ceasing to exist."
- **\`subkind\`**: "This is a \`subkind\` because it represents a rigid specialization of a \`kind\`. An instance of Y is always and necessarily an instance of X."
- **\`phase\`**: "This is a \`phase\` because it represents a contingent, temporary stage in the life of a \`kind\`. An instance can enter and leave this phase without losing its identity."
- **\`role\`**: "This is a \`role\` because it is a contingent classification that depends on a relationship with another entity. An instance plays this role only within a specific context."
- **\`relator\`**: "This is a \`relator\` because it represents the truth-maker of a material relationship, connecting two or more entities. It is the relationship itself, reified as an object."
- **\`type\`/\`powertype\`**: "This is a \`type\` because its instances are themselves types. It is a higher-order concept used for categorization."
- **\`category\`**: "This is a \`category\` because it is a rigid classification for instances of different kinds that share common properties."

### Good Example

\`\`\`tonto
/**
 * Represents the role a Character plays when formally enrolled in an educational institution.
 *
 * **OntoUML:** This is a \`role\` because a Character is only a \`Student\` while they maintain
 * a relationship (an enrollment) with a school. It is a temporary and context-dependent
 * classification. If the relationship ends, the Character ceases to be a \`Student\` but
 * remains a \`Person\`.
 */
role Student specializes Person {
    label {
        @en "Student"
        @pt-br "Estudante"
    }
    description {
        @en "A person who is studying at a school or college."
        @pt-br "Uma pessoa que esta estudando em uma escola ou faculdade."
    }
}
\`\`\`

### Bad Example (avoid)

\`\`\`tonto
/**
 * This is the Student role.
 */
role Student specializes Person {
    label { @en "Student" @pt-br "Estudante" }
    description {
        // Missing description
    }
}
\`\`\`

The bad example's comment is redundant (just restates the code) and the description is missing. It fails to explain *why* \`Student\` is a role from an ontological perspective.
`,
    },
    {
        relativePath: "references/extending.md",
        content: `# Extending Ontologies with Tonto

This guide covers how to add new classes, attributes, relations, and generalization sets to an existing Tonto ontology while maintaining ontological soundness.

## Workflow

1. **Understand the existing ontology** — Read all relevant \`.tonto\` files to grasp current scope, conventions, and key concepts.
2. **Identify new concepts** — Determine what new entities, aspects, or events need representation.
3. **Classify each concept** — Assign the correct UFO category (see decision tree below).
4. **Define attributes and relations** — Add properties and connections.
5. **Organize into packages** — Group related elements for modularity.
6. **Validate** — Check for linter errors and ontological consistency.

## Decision Tree for Choosing Stereotypes

Ask these questions about each new concept:

### Is it a Substantial (like an object)?

- **Does it provide its own identity?** (you can count, identify, and track instances)
  - Functional complex → \`kind\` (e.g., \`kind Person\`, \`kind Car\`)
  - Collection of similar members → \`collective\` (e.g., \`collective Flock\`)
  - Amount of matter → \`quantity\` (e.g., \`quantity WaterPortion\`)

### Is it a Moment (existentially dependent on other individuals)?

- Truth-maker for a material relation → \`relator\` (e.g., \`relator Employment\`)
- Measurable characteristic → \`quality\` (e.g., \`quality Weight\`)
- Intrinsic, non-measurable property → \`mode\` (e.g., \`mode Skill\`)

### Is it a Perdurant (something that happens in time)?

- Unfolds with temporal parts → \`event\` or \`process\`
- Snapshot of the world → \`situation\`

### Is it a specialization of an existing type?

- **Rigid** (always applies) → \`subkind\`
- **Anti-rigid, intrinsic change** (enters/leaves based on internal change) → \`phase\`
- **Anti-rigid, relational** (enters/leaves based on a relationship) → \`role\`
- **Anti-rigid, event context** → \`historicalRole\`

### Does it group instances from different kinds?

- **Rigid** (essential shared properties) → \`category\`
- **Semi-rigid** → \`mixin\`
- **Anti-rigid, intrinsic** → \`phaseMixin\`
- **Anti-rigid, relational** → \`roleMixin\`

## Creating New Classes

### Kinds (fundamental types)
\`\`\`tonto
kind Product {
    name: string
    sku: string { const }
    price: number
}
\`\`\`

### Specializations
\`\`\`tonto
subkind Book specializes Product {
    isbn: string { const }
    pageCount: number
}

phase Infant specializes Person {
    // intrinsic: age < some threshold
}

role Customer specializes Person {
    // relational: exists because of a purchase relationship
}
\`\`\`

### Non-Sortals
\`\`\`tonto
category PhysicalAsset of objects {
    serialNumber: string [0..1]
}

roleMixin Borrower of objects {
    // anti-rigid: depends on borrowing relationship
}
\`\`\`

### Relators
\`\`\`tonto
relator Employment {
    @mediation [1..*] -- [1] Employee
    @mediation [1..*] -- [1] Organization
    startDate: date
    endDate: date [0..1]
}
\`\`\`

### Events
\`\`\`tonto
event PurchaseOrder {
    orderDate: datetime
    totalAmount: number
}
\`\`\`

## Defining Relationships

Choose the correct connector and stereotype:

\`\`\`tonto
// Composition (exclusive part-whole)
kind Vehicle {
    @componentOf [1] <o>-- hasEngine -- [1] Engine
}

// Aggregation (shared part-whole)
kind Department {
    @memberOf [1..*] <>-- hasMembers -- [1..*] Person
}

// External material relation
@material relation Person [0..*] -- enrolledIn -- [0..*] Course
\`\`\`

## Establishing Generalizations

\`\`\`tonto
kind Vehicle { /* ... */ }
subkind Car specializes Vehicle { /* ... */ }
subkind Truck specializes Vehicle { /* ... */ }

disjoint complete genset VehicleTypes where Car, Truck specializes Vehicle
\`\`\`

## Package Organization

Group related elements into separate \`.tonto\` files by conceptual domain:

\`\`\`tonto
// src/core/persons.tonto
package core.persons
kind Person { name: string }

// src/core/organizations.tonto
import core.persons
package core.organizations
kind Organization { legalName: string }
role Employee specializes core.persons.Person { /* ... */ }
\`\`\`

## Validation Checklist

After extending the ontology, verify:

- [ ] Every sortal ultimately specializes exactly one ultimate sortal (\`kind\`, \`collective\`, \`quantity\`, etc.)
- [ ] Stereotypes correctly reflect UFO properties (rigidity, identity, dependence)
- [ ] Cardinalities are accurate for the domain
- [ ] Non-sortals have appropriate \`of <nature>\` constraints
- [ ] Relators mediate at least two distinct entities
- [ ] **No reserved keywords used as attribute names** — stereotype keywords (\`kind\`, \`role\`, \`type\`, \`phase\`, \`mode\`, \`relator\`, \`quality\`, etc.), \`label\`, \`description\`, and \`value\` are reserved and cannot be used as attribute names. Use prefixed alternatives (e.g., \`_description\`, \`_value\`, \`_role\`) or synonyms (e.g., \`summary\`, \`amount\`, \`participationRole\`).
- [ ] No linter errors in the Tonto editor
- [ ] The extension is consistent with the existing ontology's conventions
`,
    },
    {
        relativePath: "references/summarization.md",
        content: `# Understanding and Summarizing Tonto Ontologies

This guide covers how to produce clear, informative summaries of Tonto ontologies that help users quickly understand the model's theme, scope, and structure.

## General Approach

- **Focus on abstraction**: Highlight the most significant concepts and relationships, not every attribute.
- **Use ontological terminology**: Refer to classes by their UFO stereotypes (e.g., "the \`kind\` Person", "the \`relator\` Employment").
- **Be objective**: Reflect what the Tonto code actually defines, don't infer beyond it.

## Summarizing a Single Package

Cover these aspects in order:

1. **Package Purpose**: State the main theme or domain, inferred from the package name, class names, and any comments.

2. **Key Classes**: List the most important classes, prioritizing ultimate sortals (\`kind\`, \`collective\`, \`quantity\`, \`relator\`, \`event\`, \`situation\`) since they represent foundational concepts. Mention significant \`subkind\`s, \`phase\`s, or \`role\`s if central.

3. **Core Relationships**: Describe the most important relations, specifying stereotypes (\`@componentOf\`, \`@mediation\`, etc.) and cardinalities when informative.

4. **Important Generalization Sets**: Describe any \`genset\`s, noting \`disjoint\`/\`complete\` properties and listing superclass with key subclasses.

5. **Key Datatypes/Enumerations**: Mention custom \`datatype\`s or \`enum\`s if fundamental to the domain.

## Summarizing an Entire Ontology (Multiple Packages)

1. **Overall Domain and Purpose**: High-level statement about what the ontology models.

2. **Modular Structure**: Identify main packages, their sub-domains, and how they relate (imports, cross-package relations).

3. **Central Concepts**: Highlight the most fundamental types that are central across the ontology.

4. **Key Relationship Patterns**: Describe common patterns — extensive parthood, mediations for contracts, characterizations for qualities, etc.

5. **Major Taxonomies**: Summarize the most important generalization hierarchies.

6. **Ontological Profile**: Characterize what types of entities are predominantly modeled (e.g., "focuses on substantials and their roles, with some events for processes").

## What to Avoid

- **Excessive detail**: Don't list every class, attribute, or end name.
- **Syntax recitation**: Explain the meaning, don't just re-state code.
- **Assumptions**: Don't infer information not present in the definitions.
- **Lengthy explanations**: Keep summaries concise and focused.
`,
    },
    {
        relativePath: "references/terminology.md",
        content: `# Terminology Analysis and Naming Suggestions

This guide helps analyze the terminology (names of classes, attributes, relations) within a Tonto ontology and provide constructive feedback for improvement. The goal is to enhance clarity, precision, and consistency.

## Evaluation Principles

When evaluating names, consider:

- **Clarity**: Easy to understand and unambiguous in context.
- **Precision**: Accurately reflects the concept being modeled.
- **Consistency**: Follows naming conventions (PascalCase for types, camelCase for properties) uniformly.
- **Conciseness**: As short as possible without losing clarity.
- **Ontological Congruence**: Name aligns with the UFO stereotype — a \`kind\` should sound like a fundamental type, a \`relator\` like a reified relationship, a \`phase\` like a temporary state.
- **Domain Relevance**: Resonates with expert terminology in the domain.

## Analyzing Class Names

For each class, examine the name together with:

1. **Its stereotype** — Does the name reflect whether it's a \`kind\`, \`role\`, \`phase\`, \`relator\`, \`event\`?
   - Relators are typically nouns representing the relationship (e.g., \`Marriage\`, \`Enrollment\`, \`Employment\`)
   - Phases suggest temporariness (e.g., \`Child\`, \`Active\`, \`Pending\`)
   - Roles suggest relational context (e.g., \`Student\`, \`Customer\`, \`Employee\`)
   - Events suggest happenings (e.g., \`Purchase\`, \`Graduation\`, \`Submission\`)

2. **Its attributes** — Do attributes coherently define the concept? (e.g., a \`Student\` having \`studentID\`, \`major\` makes sense)

3. **Its relations** — Do participated relations and end names make sense for this class?

4. **Its specialization hierarchy** — Is the name appropriately more specific than its superclass?

5. **Labels and descriptions** — Do they suggest a better term?

### Red Flags for Class Names

- Too generic: \`Item\`, \`Data\`, \`Thing\`, \`InfoHolder\`
- Misleading for the stereotype: naming a \`relator\` like an object \`kind\`, or an \`event\` like a \`role\`
- Conflicts with UFO rigidity: a \`phase\` name that implies permanence
- Inconsistency with similar concepts elsewhere in the ontology

## Analyzing Attribute Names

For each attribute, check:

- **Data type alignment**: \`age\` for \`number\`, \`isActive\` for \`boolean\`, \`registrationDate\` for \`date\`
- **Cardinality fit**: \`phoneNumber\` for \`[1..*]\` vs. \`primaryPhone\` for \`[0..1]\`
- **Meta-property hints**: \`derived\` attributes should suggest derivation (e.g., \`fullName\`); \`const\` attributes should suggest immutability (e.g., \`ssn\`)
- **Specificity**: prefer \`creationDate\` or \`effectiveDate\` over just \`date\`
- **Boolean convention**: use \`isActive\`, \`hasChildren\` — not just \`active\`, \`children\`

### Red Flags for Attribute Names

- **Reserved keyword used as name**: \`description\`, \`label\`, \`value\`, \`role\`, \`type\`, \`kind\`, \`class\`, and all other Tonto stereotype/structural keywords are reserved and cannot be used as attribute names. Use prefixed alternatives (\`_description\`, \`_value\`, \`_role\`) or synonyms (\`summary\`, \`amount\`, \`participationRole\`).
- Vague: \`property\`, \`attr1\`, \`data\`
- Type mismatch: \`status\` as \`number\` when it's conceptually an enumeration
- Ambiguous: \`date\` without context

## Analyzing Relation Names

For each relation, check:

- **Relation name**: Does it describe the nature of the connection? Material relations often use verb phrases (e.g., \`employs\`, \`enrolledIn\`)
- **End names**: Do they indicate the role played from the other class's perspective? (e.g., \`employees\` at Person end, \`employer\` at Organization end)
- **Stereotype alignment**: Does the name match the relation stereotype semantics?
- **Cardinality consistency**: Does \`manager\` imply \`[0..1]\` or \`[1]\`?

### Red Flags for Relation Names

- Missing name where one would improve clarity
- Too generic: \`has\`, \`isRelatedTo\`, \`link\`
- End names not intuitive or missing

## Output Format

When providing terminology feedback, structure it as:

1. **Element**: Which element (e.g., "Class \`CustomerData\`", "Attribute \`val\` in \`Order\`")
2. **Current Name**: Quote the current name
3. **Rationale**: Why it could be improved (reference specific principles)
4. **Suggestion**: One or more alternatives with brief justification
5. **Affirmation**: Acknowledge names that are already clear and appropriate

**Example:**

- **Element:** Class \`InfoHolder\` (stereotype: \`relator\`)
- **Current Name:** \`InfoHolder\`
- **Rationale:** Too generic. Attributes \`startDate\`, \`endDate\` and relations to \`Person\` and \`Project\` with ends \`member\` and \`assignedProject\` suggest this represents a project membership.
- **Suggestion:** \`ProjectMembership\` — directly reflects its role as a \`relator\` connecting a \`Person\` to a \`Project\`.
`,
    },
];
