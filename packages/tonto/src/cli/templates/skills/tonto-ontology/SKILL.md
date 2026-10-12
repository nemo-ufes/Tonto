---
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
| Create new classes, relations, extend the ontology | `references/extending.md` |
| Analyze or improve naming, terminology, consistency | `references/terminology.md` |
| Summarize or explain the ontology in natural language | `references/summarization.md` |
| Write labels, descriptions, JSDoc documentation | `references/documentation.md` |

For basic syntax questions, CLI usage, or project structure, the information below is sufficient.

**Important workflow rule:** Before executing any significant change, plan your approach step-by-step and present it to the user for confirmation. Only proceed after they approve or suggest modifications.

## Core Syntax Reference

### Package and Imports

Every `.tonto` file defines exactly one package. Imports come before the package declaration.

```tonto
import core.persons
import core.organizations as orgs

package events.academic

// ... declarations ...
```

A package is defined by its file, not its directory. The folder structure is organizational only.

### Class Declarations

```tonto
<stereotype> <ClassName> (of <nature1>, <nature2>)? (specializes <Super1>, <Super2>)? (instanceOf <HigherOrderType>)? {
    label { @en "..." @pt-br "..." }
    description { @en "..." @pt-br "..." }
    // attributes
    // internal relations
}
```

### Individuals

```tonto
kind Man { name: string }
individual john: Man {
  name = "John Doe"
}
```

The classifier after `:` must reference a class declaration of any stereotype. Supply every mandatory, non-derived attribute, including attributes inherited through specialization or generalization sets. No cardinality means `[1]`; optional and derived attributes may be omitted. Use lists for multiple values, unquoted enum members for enums, and nested assignment objects for structured datatypes. Unknown attributes, duplicate assignments, incorrect value types, and cardinality violations are errors. `tonto-cli validate` checks individuals; schema exports do not preserve them.

### Stereotypes

Choosing the correct stereotype is the most important modeling decision. It reflects the ontological nature of the concept according to UFO.

**Ultimate Sortals** (provide identity principle — every sortal must ultimately specialize one):

| Stereotype | Use When | Example |
|---|---|---|
| `kind` | Functional complex that provides identity | `kind Person`, `kind Car` |
| `collective` | Collection of similar members | `collective Flock` |
| `quantity` | Amount of matter | `quantity WaterPortion` |
| `quality` | Measurable characteristic (quale) | `quality Color`, `quality Weight` |
| `mode` | Intrinsic, non-measurable property | `mode Skill`, `mode Belief` |
| `relator` | Truth-maker of a material relation | `relator Employment`, `relator Marriage` |
| `type` | Higher-order type (instances are types) | `type Species` |
| `powertype` | All possible specializations of a base type | `powertype CarModel` |

**Sortals** (inherit identity from an ultimate sortal):

| Stereotype | Rigidity | Basis | Example |
|---|---|---|---|
| `subkind` | Rigid | Essential property | `subkind Man specializes Person` |
| `phase` | Anti-rigid | Intrinsic change | `phase Child specializes Person` |
| `role` | Anti-rigid | Relational context | `role Student specializes Person` |
| `historicalRole` | Anti-rigid | Event participation | `historicalRole Veteran specializes Person` |

**Non-Sortals** (classify instances across multiple kinds):

| Stereotype | Rigidity | Example |
|---|---|---|
| `category` | Rigid | `category LivingBeing of objects` |
| `mixin` | Semi-rigid | `mixin Insurable of objects` |
| `phaseMixin` | Anti-rigid (intrinsic) | `phaseMixin DamagedItem of objects` |
| `roleMixin` | Anti-rigid (relational) | `roleMixin Customer of objects` |
| `historicalRoleMixin` | Anti-rigid (event) | `historicalRoleMixin FormerEmployee of objects` |

**Perdurants:**

| Stereotype | Use When | Example |
|---|---|---|
| `event` | Something that happens | `event Purchase` |
| `situation` | State of affairs at a point in time | `situation SystemOverload` |
| `process` | Ongoing perdurant | `process Manufacturing` |

**Neutral:** `class` — use only when undecided; the editor will warn.

### Ontological Natures

For non-sortals, constrain what kinds of instances they can have:

```tonto
category PhysicalObject of objects
roleMixin Borrowable of functional-complexes, collectives
```

Available natures: `objects`, `functional-complexes`, `collectives`, `quantities`, `relators`, `intrinsic-modes`, `extrinsic-modes`, `qualities`, `events`, `situations`, `types`, `abstract-individuals`.

### Attributes

```tonto
kind Person {
    name: string [1]
    age: number { derived }
    nicknames: string [*] { ordered }
    ssn: string [0..1] { const }
}
```

Built-in types: `string`, `number`, `boolean`, `date`, `time`, `datetime`.

Cardinalities: `[1]` (default), `[0..1]`, `[*]` (= `[0..*]`), `[1..*]`, `[2..5]`.

Meta-properties: `ordered`, `const`, `derived`.

### Reserved Keywords — Cannot Be Used as Attribute Names

The following words are **reserved** in Tonto and **must not** be used as attribute or datatype field names. If you need to express a concept that would naturally use one of these words, prefix it with an underscore or choose a synonym.

**Declaration/stereotype keywords:**
`kind`, `collective`, `quantity`, `quality`, `mode`, `relator`, `type`, `powertype`, `subkind`, `phase`, `role`, `historicalRole`, `category`, `mixin`, `phaseMixin`, `roleMixin`, `historicalRoleMixin`, `event`, `situation`, `process`, `class`, `datatype`, `enum`, `relation`, `genset`, `intrinsicMode`, `extrinsicMode`

**Structural keywords:**
`label`, `description`, `specializes`, `instanceOf`, `of`, `import`, `package`, `disjoint`, `complete`, `general`, `specifics`, `categorizer`, `where`, `inverseOf`

**Common pitfalls and fixes:**

| Intended name | Problem | Fix |
|---|---|---|
| `description` | Reserved (class description block) | `_description`, `summary`, or `details` |
| `value` | Conflicts with internal usage | `_value`, `amount`, or `measure` |
| `role` | Reserved (stereotype keyword) | `_role`, `participationRole`, or `function` |
| `type` | Reserved (stereotype keyword) | `_type`, `category`, or `classification` |
| `label` | Reserved (label block keyword) | `_label`, `displayName`, or `title` |
| `class` | Reserved (stereotype keyword) | `_class`, `category`, or `classification` |

**Example:**
```tonto
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
```

### Datatypes and Enumerations

```tonto
datatype Address {
    street: string
    city: string
    zipCode: string [0..1]
}

enum EyeColor { Blue, Green, Brown, Black }
```

### Relations

**Connectors:**
- `--` : general association
- `<>--` : aggregation (shared part-whole, diamond at source)
- `<o>--` : composition (exclusive part-whole, diamond at source)

**Relation stereotypes** (prefix with `@`): `@mediation`, `@componentOf`, `@memberOf`, `@subCollectionOf`, `@material`, `@formal`, `@characterization`, `@instantiation`, `@termination`, `@participational`, `@participation`, `@historicalDependence`, `@creation`, `@manifestation`, `@bringsAbout`, `@triggers`, `@externalDependence`, `@subQuantityOf`.

**Internal relations** (inside a class body — the class is the source):

```tonto
kind University {
    @componentOf [1] <o>-- hasDepartments -- [1..*] Department
}

relator Employment {
    @mediation [1..*] -- [1] Employee
    @mediation [1..*] -- [1] Employer
}
```

**External relations:**

```tonto
@material relation Person [0..*] -- enrolledIn -- [0..*] Course
```

**End meta-attributes:**

```tonto
({ ordered, subsets previousContracts } formerContracts)
```

### Generalization Sets

**Short syntax:**
```tonto
disjoint complete genset PersonPhases where Child, Teenager, Adult specializes Person
```

**Expanded syntax (with categorizer):**
```tonto
type PersonAgePhaseType
disjoint complete genset PhasesOfPerson {
    general Person
    categorizer PersonAgePhaseType
    specifics Child, Teenager, Adult
}
```

- `disjoint`: instance of superclass can belong to at most one subclass in the set.
- `complete`: instance of superclass must belong to at least one subclass in the set.
- Both together = partition.

### Multi-Level Modeling

**Powertype** (all possible specializations of a base type):
```tonto
powertype CarModel specializes Car
subkind Sedan (instanceOf CarModel) specializes Car
```

**Categorizer** (specific subset based on a criterion):
```tonto
type PropulsionType specializes CarModel
disjoint complete genset CarPropulsion {
    general Car
    categorizer PropulsionType
    specifics ElectricCar, GasolineCar, HybridCar
}
```

## Project Structure

```
my-ontology/
├── src/           # .tonto source files
├── lib/           # External packages (managed by tpm)
├── generated/     # Output artifacts (JSON, GUFO)
└── tonto.json     # Project manifest
```

## CLI Commands

- `tonto-cli init` — Initialize new project
- `tonto-cli validate <dir>` — Validate (add `--with-api` for API-based checks)
- `tonto-cli generate <dir>` — Generate JSON representation
- `tonto-cli transform <dir>` — Transform to GUFO (Turtle/TTL)
- `tonto-cli import <file.json>` — Generate .tonto from JSON
- `tpm install` — Install dependencies
- `tpm add <package>` — Add a dependency

## Best Practices

- **Modular design**: Use separate `.tonto` files for distinct conceptual domains. Use imports to connect them.
- **Accurate stereotyping**: The stereotype choice is the most consequential decision. Understand UFO distinctions (rigidity, sortality, identity, dependence) before choosing. Avoid using generic `class` when the ontological nature is clear.
- **Clear naming**: PascalCase for types, camelCase for attributes and relation ends. Relators are nouns representing the relationship; roles reflect the role played.
- **Precise cardinalities**: Define them carefully for both attributes and relation ends.
- **Ontological natures for non-sortals**: Use the `of <nature>` clause to constrain instances.
- **Meaningful gensets**: Structure taxonomies explicitly with `disjoint` and `complete`.
- **Always check linter errors**: They surface ontological inconsistencies.
