export const tontoGuidance: string = `
# Tonto Grammar Reference for LLMs

This document provides a complete grammar reference for the Tonto language. Tonto is a textual DSL for ontological modeling based on UFO (Unified Foundational Ontology), serving as a textual counterpart to OntoUML.

## Introduction to Tonto

**What is Tonto?**
Tonto is a textual modeling language for creating well-founded ontologies. It enables developers to define conceptual models with the rigor of UFO while enjoying the benefits of a textual syntax.

**Key Characteristics:**
- **UFO-Based:** Constructs directly reflect UFO's ontological distinctions (kinds, phases, roles, relators, events). This ensures models are ontologically well-founded.
- **Textual Syntax:** Enables version control (Git), model diffing, merging, and automated processing.
- **Tool-Supported:** IDE features include syntax highlighting, real-time validation, auto-completion, and transformations (OntoUML JSON, OWL, GUFO).
- **Modularization:** Break ontologies into packages with dependency management for reuse and organization.

**Goal:** Facilitate high-quality, precise conceptual models by leveraging UFO's clear semantics in a user-friendly textual format.

**Individuals**: Tonto supports schema declarations and named individuals with validated attribute values. Individuals are not included in schema diagrams or OntoUML JSON/OWL exports.

## 1. Quick Syntax Reference

### File Structure Pattern
\`\`\`
(Import)*
Package
Declaration*
\`\`\`

### Import
\`\`\`
import <PackageName>
import <PackageName> as <Alias>
\`\`\`

### Package
\`\`\`
(global)? package <QualifiedName>
\`\`\`

### Class Declaration Pattern
\`\`\`
<Stereotype> <ClassName> (of <Nature>(, <Nature>)*)? 
 '('instanceOf <HigherOrderType>')'?
  (specializes <SuperClass>(, <SuperClass>)*)?
{
  (label { @<lang> "<text>" })?
  (description { @<lang> "<text>" })?
  (<Attribute>)*
  (<InternalRelation>)*
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

### Attribute Pattern
\`\`\`
<name>: <DataType> (<Cardinality>)? ({ <MetaAttribute> })?
\`\`\`

### Internal Relation Pattern
\`\`\`
(@<RelationStereotype>)? 
  (<FirstEndMeta>)? (<FirstCardinality>)? 
  <Connector> (<relationName>)? (--)?
  (<SecondCardinality>)? (<SecondEndMeta>)?
  <TargetClass>
  (specializes <RelationName>)?
  (inverseOf <RelationName>)?
\`\`\`

### External Relation Pattern
\`\`\`
(@<RelationStereotype>)? relation <SourceClass>
  (<FirstEndMeta>)? (<FirstCardinality>)? 
  <Connector> (<relationName>)? (--)?
  (<SecondCardinality>)? (<SecondEndMeta>)?
  <TargetClass>
  (specializes <RelationName>)?
  (inverseOf <RelationName>)?
\`\`\`

### Datatype Pattern
\`\`\`
datatype <Name> (specializes <BaseType>)? {
  (<Attribute>)*
}
\`\`\`

### Enum Pattern
\`\`\`
enum <Name> (specializes <BaseType>)? {
  <Element1>(, <Element2>)*
}
\`\`\`

### Generalization Set Patterns
\`\`\`
// Short syntax
(disjoint)? (complete)? genset <Name> where
  <Subclass1>(, <Subclass2>)* specializes <Superclass>

// Full syntax with categorizer
(disjoint)? (complete)? genset <Name> {
  general <Superclass>
  (categorizer <HigherOrderType>)?
  specifics <Subclass1>(, <Subclass2>)*
}
\`\`\`

## 2. Core Language Elements

### 2.1. Terminals and Identifiers

**ID Pattern:** \`/[_a-zA-Z][w_-~$#@/d]*/\`
- Valid: \`Person\`, \`_internal\`, \`address-type\`, \`v$1\`, \`sys#core\`, \`path/to/item\`
- IDs can contain: letters, digits, \`_\`, \`-\`, \`~\`, \`$\`, \`#\`, \`@\`, \`/\`
- IDs can't contain reserved keywords (class and relation stereotypes and other keywords to declare elements)

**QualifiedName:** \`ID ('.' ID)*\`
- Examples: \`Person\`, \`core.Person\`, \`university.departments.Department\`

**STRING:** \`"text"\` or \`'text'\`
- Both single and double quotes are valid
- Examples: \`"Hello World"\`, \`'Single quoted'\`

**INT:** \`/[0-9]+/\`
- Examples: \`0\`, \`1\`, \`42\`, \`1000\`

### 2.2. Comments
\`\`\`tonto
// Single-line comment

/* Multi-line comment
   can span multiple lines */

/* Nested /* are not */ supported - ends at first */
\`\`\`

### 2.3. Packages and Imports

**Package Declaration:**
\`\`\`tonto
package MyOntology
\`\`\`

**Global Package:**
\`\`\`tonto
global package CoreTypes
\`\`\`

**Qualified Package Names:**
\`\`\`tonto
package university.academic
package company.hr.employees
\`\`\`

**Import Statements:**
\`\`\`tonto
import CoreTypes
import university.academic
import company.hr.employees as HR

package MyPackage
// Can now reference HR.Employee, university.academic.Course, etc.
\`\`\`

**Important:** Imports MUST come before the package declaration.

## 3. Type Declarations

### 3.1. Class Stereotypes - Ontological Meaning

**What are Stereotypes?**
Stereotypes (keywords) determine the ontological meta-properties of a class according to UFO. Choosing the correct stereotype is crucial for creating a well-founded ontology.

**Ultimate Sortals** (provide identity principle):

These supply an identity criterion for their instances - they answer "what is this thing essentially?"

- \`kind\` - Substantial individuals that are functional complexes
  - *Meaning:* Endurants with unity, e.g., each Person is a countable individual
  - *Examples:* Person, Car, Organization, Building
  
- \`collective\` - Collections whose members are of the same kind
  - *Meaning:* Wholes made of similar parts (forest = trees, fleet = ships)
  - *Examples:* Forest, Fleet, Committee, Team
  
- \`quantity\` - Portions of matter
  - *Meaning:* Amounts without countable parts (water, sand)
  - *Examples:* PortionOfWater, AmountOfSand, BodyOfAir
  
- \`quality\` - Individual moments mappable to quality spaces
  - *Meaning:* Measurable/comparable properties that can change while maintaining identity
  - *Examples:* Color (of an apple), Temperature, Weight, Height
  
- \`mode\` - Intrinsic, non-describable moments
  - *Meaning:* Properties that are not externally measurable (beliefs, skills)
  - *Examples:* Belief, Skill, Intention, Desire
  - Specialized into: \`intrinsicMode\`, \`extrinsicMode\`
  
- \`relator\` - Truth-makers of material relations
  - *Meaning:* Entities that connect multiple individuals and ground their relationship
  - *Examples:* Marriage (connects spouses), Employment (connects employee & employer), Enrollment

- \`type\` - Higher-order types (2nd-order)
  - *Meaning:* Types whose instances are themselves types
  - *Examples:* Species (instances: Dog, Cat), ProductType, JobPosition

- \`powertype\` - The complete set of all specializations
  - *Meaning:* Contains ALL possible subtypes of a base type (like mathematical powerset)
  - *Examples:* CarModel (all car types), AnimalSpecies (all animal types)

**Sortals** (inherit identity from ultimate sortals):

These specialize kinds and other ultimate sortals, inheriting their identity criterion.

- \`subkind\` - Rigid specialization
  - *Meaning:* Essential properties - an instance is ALWAYS this type if it ever is
  - *Rigidity:* Rigid (cannot change)
  - *Examples:* Man, Woman (if Person), GasolineCar (if Car)
  
- \`phase\` - Contingent, intrinsic specialization
  - *Meaning:* Based on intrinsic properties that can change over time
  - *Rigidity:* Anti-rigid (can change)
  - *Examples:* Child, Adult (Person phases), Caterpillar, Butterfly (Insect phases)
  
- \`role\` - Contingent, relational specialization
  - *Meaning:* Based on relationships with other entities (context-dependent)
  - *Rigidity:* Anti-rigid (can gain/lose the role)
  - *Examples:* Student, Employee, Customer (a Person plays these roles contextually)
  
- \`historicalRole\` - Role dependent on past events
  - *Meaning:* Roles acquired by participating in specific events
  - *Examples:* WarVeteran, Alumnus, FormerPresident

**Non-Sortals** (classify across different kinds):

These classify instances from multiple ultimate sortals - they don't provide identity.

- \`category\` - Rigid, essential across kinds
  - *Meaning:* Essential commonalities between different kinds of things
  - *Rigidity:* Rigid
  - *Examples:* PhysicalObject (applies to Person, Car, Building), LivingBeing
  
- \`mixin\` - Semi-rigid
  - *Meaning:* Essential for some instances, accidental for others
  - *Rigidity:* Semi-rigid
  - *Examples:* Insurable (essential for InsurancePolicy, accidental for Car)
  
- \`phaseMixin\` - Anti-rigid, intrinsic across kinds
  - *Meaning:* Contingent intrinsic properties that apply across kinds
  - *Rigidity:* Anti-rigid
  - *Examples:* LivingThing (can die), DefectiveItem (can be fixed)
  
- \`roleMixin\` - Anti-rigid, relational across kinds
  - *Meaning:* Contingent relational properties across kinds
  - *Rigidity:* Anti-rigid
  - *Examples:* Customer (Person or Organization), Supplier (Person or Organization)
  
- \`historicalRoleMixin\` - Anti-rigid historical role across kinds
  - *Meaning:* Historical roles that apply to different kinds
  - *Examples:* Victim (Person or Organization)

**Perdurants** (events and processes):

Occurrences in time (contrasted with endurants which persist through time).

- \`event\` - Occurrences with well-defined temporal boundaries
  - *Meaning:* Something that happens, with a start and end
  - *Examples:* Purchase, Birth, Meeting, Accident
  
- \`situation\` - States of affairs at a point in time
  - *Meaning:* A configuration of entities at a moment
  - *Examples:* SystemOverload, EmergencySituation, TrafficJam
  
- \`process\` - Ongoing perdurants
  - *Meaning:* Extended occurrences, possibly without clear boundaries
  - *Examples:* Aging, ErosionProcess, Learning

**Neutral:**
- \`class\` - Use when ontological nature is undecided
  - *Warning:* Tonto will warn about this - specify a proper stereotype as soon as possible

### 3.2. Complete Class Declaration Examples

**Simple Kind:**
\`\`\`tonto
kind Person {
  name: string
  birthDate: date
  age: number { derived }
}
\`\`\`

**With Specialization:**
\`\`\`tonto
subkind Man specializes Person

phase Child specializes Person

role Student specializes Person
\`\`\`

**With Ontological Natures:**
\`\`\`tonto
category PhysicalObject of objects

category Agent of functional-complexes, collectives

mixin Insurable of objects, collectives
\`\`\`

**With Instance-Of (Multi-Level):**
\`\`\`tonto
type AnimalSpecies

kind Dog (instanceOf AnimalSpecies)

kind Cat (instanceOf AnimalSpecies)
\`\`\`

**With Labels and Descriptions:**
\`\`\`tonto
kind Person {
  label {
    @en "Person"
    @pt "Pessoa"
    @es "Persona"
  }
  description {
    @en "Represents a human being"
    @pt "Representa um ser humano"
  }
  name: string
  age: number
}
\`\`\`

**Relator:**
\`\`\`tonto
relator Marriage {
  marriageDate: date
  @mediation [2..2] -- spouses -- [1] Person
}
\`\`\`

**Event:**
\`\`\`tonto
event Purchase {
  purchaseDate: datetime
  totalAmount: number
  @participation [1..*] -- buyer -- [1] Person
  @participation [1..*] -- seller -- [1] Organization
}
\`\`\`

### 3.3. Attributes - Properties and Cardinalities

**What are Attributes?**
Attributes define properties of classes - they represent values or data associated with instances.

**Basic Attributes:**
\`\`\`tonto
name: string
age: number
isActive: boolean
birthDate: date
lastLogin: datetime
\`\`\`

**Cardinalities - Multiplicity Constraints:**

Cardinalities specify how many values an attribute can have. Default is \`[1]\` (exactly one).

\`\`\`tonto
name: string [1]              // Exactly one (default, can be omitted)
middleName: string [0..1]     // Optional - may or may not exist
phoneNumbers: string [*]      // Zero or more - any number including none
phoneNumbers: string [0..*]   // Same as [*]
tags: string [1..*]          // One or more - at least one required
coordinates: number [2..2]    // Exactly two (e.g., latitude & longitude)
ratings: number [1..5]       // Between 1 and 5 (useful for constrained ranges)
\`\`\`

**Meta-Attributes - Semantic Modifiers:**

Meta-attributes add semantic constraints to attributes.

\`\`\`tonto
// ORDERED - values form a sequence (position matters)
// Use when: Order is semantically significant
children: Person [*] { ordered }       // Birth order matters
rankings: number [*] { ordered }       // Rank 1, 2, 3...

// CONST - immutable after creation
// Use when: Value should never change once set
socialSecurityNumber: string { const }
dateOfBirth: date { const }

// DERIVED - computed from other information
// Use when: Value is calculated, not stored
age: number { derived }                // Computed from birthDate
fullName: string { derived }           // Computed from firstName + lastName
totalPrice: number { derived }         // Sum of item prices

// COMBINED - multiple meta-attributes
historyLog: string [*] { ordered derived }  // Computed list in order
identityCode: string { const ordered }      // Immutable ordered value
\`\`\`

**When to use each meta-attribute:**
- \`ordered\`: List of children, sequence of steps, ranking systems
- \`const\`: Identifiers, immutable facts (SSN, VIN, birth date)
- \`derived\`: Aggregations, computations (age from birthDate, totals from parts)

### 3.4. Datatypes - Complex Value Types

**What are Datatypes?**
Datatypes represent structured values (not entities). They group related primitive values into reusable, composite types. Unlike classes, datatypes don't have identity - two datatypes with the same values are considered equal.

**When to use Datatypes vs. Classes:**
- **Datatype:** For values (Address, Coordinates, DateRange) - identity doesn't matter
- **Class:** For entities (Person, Building) - each instance has unique identity

**Simple Datatype:**
\`\`\`tonto
datatype Address {
  street: string
  number: string
  city: string
  zipCode: string [0..1]
}
\`\`\`

**Datatype with Specialization:**

Datatypes can specialize other datatypes to add more attributes.

\`\`\`tonto
datatype Name {
  firstName: string
  lastName: string
}

datatype FullName specializes Name {
  middleNames: string [*]
  title: string [0..1]       // Dr., Prof., etc.
}
\`\`\`

**Using Datatypes:**
\`\`\`tonto
kind Person {
  personalName: FullName
  homeAddress: Address [0..1]
  workAddresses: Address [*]    // A person can have multiple addresses
}
\`\`\`

### 3.5. Enumerations - Fixed Value Sets

**What are Enumerations?**
Enumerations define a fixed set of named values. Use them when an attribute can only take values from a known, finite set.

**When to use Enums:**
- Fixed lists of options (days of week, months, status codes)
- Domain-specific categories (priority levels, membership types)
- NOT for lists that may grow (countries, products) - use classes instead

**Simple Enum:**
\`\`\`tonto
enum Gender {
  Male,
  Female,
  Other
}

enum DayOfWeek {
  Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
}

enum Priority {
  Low, Medium, High, Critical
}
\`\`\`

**Using Enums:**
\`\`\`tonto
kind Person {
  name: string
  gender: Gender
  preferredWorkDays: DayOfWeek [1..*]
}

kind Task {
  description: string
  priority: Priority
}
\`\`\`

## 4. Relations (Associations)

**What are Relations?**
Relations represent connections and dependencies between entities. In UFO/OntoUML, relations have precise ontological semantics and can be:
- **Material:** Grounded in the physical world, mediated by relators
- **Formal:** Abstract, mathematical, or logical connections
- **Part-Whole:** Compositional relationships (mereological)

Relations can be declared internally (within a class body) or externally (standalone).

### 4.1. Relation Connectors - Structural Semantics

**Association (\`--\`):** General connection between entities

\`\`\`tonto
kind Person {
  [1] -- knows -- [*] Person       // Person knows other persons
}
\`\`\`

**Aggregation (\`<>--\`):** Shared part-whole (shareable aggregation)

- *Meaning:* Parts can exist independently and be shared between wholes
- *Direction:* Diamond on the WHOLE/aggregate side
- *Example:* Team has members (person can be in multiple teams)

\`\`\`tonto
kind Team {
  [1] <>-- hasMembers -- [3..*] Person    // Team aggregates persons
}
\`\`\`

**Composition (\`<o>--\`):** Exclusive part-whole (existential dependence)

- *Meaning:* Parts exist only as part of the whole, destroyed with the whole
- *Direction:* Filled diamond on the COMPOSITE/whole side
- *Example:* Car has engine (engine exists only as part of this car)

\`\`\`tonto
kind Car {
  [1] <o>-- hasEngine -- [1] Engine       // Car composes engine
}
\`\`\`

**Inverted Connectors (\`--<>\`, \`--<o>\`):** Diamond on the target side

Less common, but valid when reading from the part's perspective.

\`\`\`tonto
kind Engine {
  [1] --<o> partOf -- [1] Car             // Engine is part of car
}
\`\`\`

### 4.2. Relation Stereotypes - Ontological Semantics

**What are Relation Stereotypes?**
Stereotypes specify the ontological nature of a relation in UFO. They define WHY and HOW entities are connected, making the model more precise and semantically rich.

**Material Relations** (grounded in physical reality):

- \`@material\` - General material relation
  - *Use when:* Entities are connected through material/physical dependence
  
- \`@mediation\` - Between relator and the entities it connects
  - *Meaning:* The relator is the "glue" connecting the entities
  - *Use:* Always use for relator-to-participant connections
  - *Example:* Marriage mediates between two Persons
  
- \`@characterization\` - Between bearer and its intrinsic moments (modes/qualities)
  - *Meaning:* The moment inheres in (exists in) the bearer
  - *Use:* Connects entities to their properties (Headache characterizes Person)
  - *Example:* Color characterizes Apple, Belief characterizes Person
  
- \`@externalDependence\` - External dependence relation
  - *Meaning:* One entity depends on another for its existence
  
- \`@componentOf\` - Component-of (functional part-whole)
  - *Meaning:* Functional composition where part has a specific role
  - *Example:* Engine componentOf Car, Heart componentOf Person
  
- \`@memberOf\` - Member-of (collective membership)
  - *Meaning:* Instance is member of a collection
  - *Example:* Tree memberOf Forest, Ship memberOf Fleet
  
- \`@subCollectionOf\` - Sub-collection relation
  - *Meaning:* One collection is part of another
  - *Example:* Squad subCollectionOf Battalion
  
- \`@subQuantityOf\` - Sub-quantity relation
  - *Meaning:* Part of a quantity
  - *Example:* PortionOfWater subQuantityOf Lake
  
- \`@constitution\` - Constitution relation
  - *Meaning:* Different entity types sharing same matter (clay constitutes statue)

For relations with a mereological stereotype (e.g. @componentOf, @memberOf, @subCollectionOf) you must have on one of the two sides an aggregation or composition
  
**Formal Relations** (abstract, non-material):

- \`@formal\` - General formal relation
  - *Use when:* Connection is logical/mathematical, not material
  
- \`@comparative\` - Comparative relation
  - *Use:* Comparing entities (heavier than, older than)
  
- \`@instantiation\` - Instance-of relation
  - *Use:* Links instances to their types (1st-order to 2nd-order)
  - *Example:* Fido instantiation Dog
  
- \`@derivation\` - Derivation relation
  - *Use:* One entity derives from another

**Event-Related Relations** (connecting perdurants and endurants):

- \`@participation\` - Entity participates in event
  - *Use:* Standard participation in events
  - *Example:* Person participation Purchase
  
- \`@participational\` - General participational
  
- \`@creation\` - Entity created by event
  - *Use when:* Event brings entity into existence
  - *Example:* Birth creation Person
  
- \`@termination\` - Entity terminated by event
  - *Use when:* Event ends entity's existence
  - *Example:* Death termination Person
  
- \`@historicalDependence\` - Dependence on past events
  
- \`@bringsAbout\` - Event causes another event
  - *Use:* Causal relations between events
  
- \`@triggers\` - Event triggers another event
  
- \`@manifestation\` - Disposition manifests in event

**Modes and Qualities:**

- \`@inherence\` - Moment inheres in bearer
  
- \`@value\` - Quality maps to value in quality space
  - *Use:* Connects quality to its measurement value

### 4.3. Relation End Meta-Attributes

**Syntax:**
\`\`\`
({ meta1, meta2, ... } endName)
\`\`\`

**Available Meta-Attributes:**
- \`ordered\` - End forms an ordered collection
- \`const\` - Immutable after creation
- \`derived\` - Computed/derived relation
- \`subsets <RelationEndQualifiedName>\` - This relation end is a subset of another named relation end
- \`redefines <RelationEndQualifiedName>\` - This relation end redefines another named relation end

**Examples:**
\`\`\`tonto
kind Person {
  // Ordered children
  ({ ordered } parents) [2..2] -- [*] ({ ordered } children) Person
  
  // Derived relation
  [1] -- ({ derived } ancestors) -- [*] Person

  // Base relation with a named end
  [1] -- knows -- [*] (contacts) Person
  
  // Subsets another named relation end
  [1] -- closeAssociates -- [*] ({ subsets Person.knows.contacts } bestFriends) Person
}
\`\`\`

### 4.4. Internal Relations

Declared inside a class body. The containing class is the source end.

**Basic Internal Relations:**
\`\`\`tonto
kind Person {
  name: string
  
  // Simple association
  [1] -- livesIn -- [1] City
  
  // With both cardinalities and name
  [1] -- worksFor -- [0..1] Company
  
  // With end names
  [1] (employee) -- employs -- [1..*] (employer) Company
}
\`\`\`

**With Stereotypes:**
\`\`\`tonto
relator Marriage {
  marriageDate: date
  
  @mediation [1] -- [2..2] Person
}

mode Headache {
  intensity: number
  
  @characterization [1..*] -- [1] Person
}
\`\`\`

**With Meta-Attributes:**
\`\`\`tonto
kind Organization {
  // Ordered members with meta-attributes
  [1] <>-- ({ ordered } org) -- [1..*] ({ ordered } members) Person
  
  // Multiple meta-attributes
  [1] -- ({ derived, const } owner) -- [*] Asset
}
\`\`\`

**Relation Specialization:**
\`\`\`tonto
kind Person {
  [1] -- associates -- [*] Person
}

kind Professor specializes Person {
  // Specializes the associates relation
  [1] -- colleagues -- [*] Professor specializes associates
}
\`\`\`

**Inverse Relations:**
\`\`\`tonto
kind Person {
  [1] -- parent -- [*] child Person
}

kind Child specializes Person {
  [1] -- child -- [*] parent Person inverseOf parent
}
\`\`\`

### 4.5. External Relations

Declared outside class bodies. Useful for relations between classes from different packages.

**Basic External Relations:**
\`\`\`tonto
kind Person
kind Organization

// External relation
relation Person [1] -- worksFor -- [1..*] Organization
\`\`\`

**With All Features:**
\`\`\`tonto
@material relation Person 
  ({ ordered } employee) [1] -- employment -- [0..*] 
  ({ ordered } employer) Organization
  
@mediation relation EmploymentContract [1..*] -- [1] Person

@mediation relation EmploymentContract [1..*] -- [1] Organization
\`\`\`

**Cross-Package External Relations:**
\`\`\`tonto
import university.academic
import company.hr

package integration

// Relating classes from different packages
relation university.academic.Student [1] -- interns -- [0..1] company.hr.Employer
\`\`\`

**Relation Specialization (External):**
\`\`\`tonto
relation Person [1] -- associates -- [*] Person

relation Student [1] -- studyPartners -- [*] Student specializes associates
\`\`\`

### 4.6. Relation-to-Relation References

Relations can relate to other relations and reference them:

\`\`\`tonto
kind Person {
  [1] -- parent -- [*] child Person
}

// This relation can specialize or reference the parent relation
kind Adult specializes Person {
  [1] -- legalGuardian -- [*] dependent Person specializes parent
}
\`\`\`

## 5. Generalization Sets (Gensets)

**What are Generalization Sets?**
Gensets organize related specializations and express important ontological constraints. They answer questions like: "Can a Person be both a Man and a Woman?" (disjoint) or "Must every Person be either a Child or an Adult?" (complete).

**Why use Gensets?**
- **Formalize taxonomies:** Make classification criteria explicit
- **Express constraints:** Define mutual exclusion (disjoint) and coverage (complete)
- **Enable validation:** System can check if instances violate constraints
- **Document intent:** Show which specializations belong together conceptually

### 5.1. Properties - Ontological Constraints

**\`disjoint\`:** An instance can belong to at most ONE of the subclasses.
- *Meaning:* Specializations are mutually exclusive
- *Example:* A Person cannot be both Man AND Woman simultaneously
- *Use when:* Specializations represent alternative classifications

**\`complete\`:** An instance MUST belong to at least ONE of the subclasses.
- *Meaning:* Specializations cover all possible instances of the general class
- *Example:* Every Person must be either Child OR Adult (no gaps)
- *Use when:* You've modeled all possible cases

**\`disjoint complete\`:** Partition - exactly one subclass (most common)
- *Meaning:* Every instance belongs to exactly ONE subclass
- *Example:* Every Vehicle is exactly one of: New OR Used (not both, not neither)
- *Use when:* Creating mutually exclusive, exhaustive classifications

### 5.2. Short Syntax

\`\`\`tonto
// Basic genset
genset AgePhases where Child, Adult specializes Person

// Disjoint only
disjoint genset PersonTypes where Man, Woman specializes Person

// Complete only
complete genset LifeStages where Infant, Child, Teen, Adult, Senior specializes Person

// Disjoint and complete (partition)
disjoint complete genset Gender where Male, Female specializes Person
\`\`\`

### 5.3. Full Syntax with Categorizer

The categorizer is a higher-order type that classifies the subclasses.

\`\`\`tonto
// Define the categorizer type
type PersonAgePhaseType

// Define the genset with categorizer
disjoint complete genset PersonAgePhases {
  general Person
  categorizer PersonAgePhaseType
  specifics Child, Teenager, Adult, Senior
}

// Subclasses are instances of the categorizer
phase Child (instanceOf PersonAgePhaseType) specializes Person
phase Teenager (instanceOf PersonAgePhaseType) specializes Person
phase Adult (instanceOf PersonAgePhaseType) specializes Person
phase Senior (instanceOf PersonAgePhaseType) specializes Person
\`\`\`

### 5.4. Gensets with Relations

Gensets can also group relation specializations:

\`\`\`tonto
kind Person {
  [1] -- associates -- [*] Person
}

role Friend specializes Person {
  [1] -- friendsWith -- [*] Friend specializes associates
}

role Colleague specializes Person {
  [1] -- colleagueOf -- [*] Colleague specializes associates
}

// Genset for relation specializations
disjoint genset AssociationTypes where friendsWith, colleagueOf specializes associates
\`\`\`

### 5.5. Complete Example

\`\`\`tonto
package example.gensets

kind Person {
  name: string
  age: number
}

// Partition by gender
subkind Man specializes Person
subkind Woman specializes Person
disjoint complete genset GenderPartition where Man, Woman specializes Person

// Partition by age phases with categorizer
type AgePhaseType

phase Child (instanceOf AgePhaseType) specializes Person
phase Teenager (instanceOf AgePhaseType) specializes Person
phase Adult (instanceOf AgePhaseType) specializes Person

disjoint complete genset AgePhases {
  general Person
  categorizer AgePhaseType
  specifics Child, Teenager, Adult
}

// Non-partition: roles (not complete, not disjoint)
role Student specializes Person
role Employee specializes Person
role Parent specializes Person
genset SocialRoles where Student, Employee, Parent specializes Person
\`\`\`
## 6. Multi-Level Modeling and Powertype Patterns

**What is Multi-Level Modeling?**
Multi-level modeling represents types whose instances are themselves types (not just individuals). This is essential for modeling classifications, taxonomies, and type systems themselves.

**Why Multi-Level Modeling?**
- **Model type systems:** Represent species, product types, job positions as first-class entities
- **Express type-level properties:** Attributes of types themselves (e.g., Species has averageLifespan)
- **Enable dynamic taxonomies:** Types can be created at runtime
- **Formalize classifications:** Make implicit type hierarchies explicit

**Real-World Examples:**
- **Species** is a type; **Dog** and **Cat** are instances of Species AND types themselves
- **JobPosition** is a type; **Manager** and **Engineer** are both instances (of JobPosition) AND types (that classify persons)
- **ProductModel** is a type; **iPhone15** and **GalaxyS24** are instances that classify individual phones

### 6.1. Higher-Order Types - Ontological Levels

**The Order Hierarchy:**
- **1st-order individuals:** Concrete entities in the world
  - *Examples:* Fido (a specific dog), John Smith (a specific person)
  
- **1st-order types:** Types that classify individuals
  - *Examples:* \`kind Dog\`, \`kind Person\`, \`kind Car\`
  - These are the "normal" classes in most modeling
  
- **2nd-order types:** Types that classify 1st-order types
  - *Examples:* \`type Species\`, \`type JobPosition\`, \`type ProductModel\`
  - These classify other types, not individuals
  
- **3rd-order types:** Types of 2nd-order types (rare)
  - *Example:* \`type BiologicalRank\` (classifies Species, Genus, Family...)

**Linking Levels with \`instanceOf\`:**

Use \`instanceOf\` to connect a type to its higher-order type.

\`\`\`tonto
// 2nd-order type (classifies species)
type Species

// 1st-order types that are instances of Species
// Dog is BOTH: an instance of Species AND a type that classifies individual dogs
kind Dog (instanceOf Species)
kind Cat (instanceOf Species)
kind Horse (instanceOf Species)
\`\`\`

**Reading this:**
- "Dog is a kind" - Dog is a 1st-order type
- "Dog is an instance of Species" - Dog is classified by the 2nd-order type Species
- Individual dogs (Fido, Rex) are instances of Dog, NOT instances of Species

### 6.2. Powertype Pattern - Universal Classification

**What is a Powertype?**
A \`powertype\` is a 2nd-order type whose instances are ALL possible specializations of a base type, including the base type itself. It's analogous to a mathematical powerset.

**When to use Powertype:**
- To represent the most general classification of subtypes
- When you need a type that encompasses all possible variations
- Often used as a parent for more specific categorizers

**Key Property:** The base type itself IS an instance of its powertype.

\`\`\`tonto
kind Animal

// AnimalSpecies is the powertype - it includes ALL possible animal specializations
// Even "Animal" itself is conceptually an instance of AnimalSpecies
powertype AnimalSpecies

kind Dog (instanceOf AnimalSpecies) specializes Animal
kind Cat (instanceOf AnimalSpecies) specializes Animal
kind Bird (instanceOf AnimalSpecies) specializes Animal
// Any future animal type would also be (instanceOf AnimalSpecies)
\`\`\`

### 6.3. Categorizer Pattern - Criterion-Based Classification

**What is a Categorizer?**
A \`categorizer\` is a 2nd-order type that groups a SPECIFIC SUBSET of specializations based on a particular classification criterion. Unlike powertypes, categorizers partition types by specific attributes.

**When to use Categorizer:**
- To classify types by a specific criterion (propulsion, size, purpose)
- To create meaningful taxonomies with constraints
- To express that certain specializations form a coherent group
- Most common in practice (more useful than strict powertypes)

**Key Property:** The base type is NOT an instance of its categorizer. Only proper specializations are.

**Why use Categorizers:**
- **Multiple Criteria:** A type can have multiple categorizers (Car by propulsion, by size, by purpose)
- **Explicit Criteria:** Makes the classification basis clear
- **Constraints:** Combine with disjoint/complete gensets for validation

\`\`\`tonto
kind Car

// PropulsionType categorizes cars by HOW they're powered
type PropulsionType

disjoint complete genset CarByPropulsion {
  general Car
  categorizer PropulsionType       // This type classifies the partition
  specifics ElectricCar, GasolineCar, HybridCar
}

subkind ElectricCar (instanceOf PropulsionType) specializes Car
subkind GasolineCar (instanceOf PropulsionType) specializes Car
subkind HybridCar (instanceOf PropulsionType) specializes Car

// Can have multiple categorizers for the same base type
type SizeType

disjoint complete genset CarBySize {
  general Car
  categorizer SizeType            // Different classification criterion
  specifics CompactCar, SedanCar, SUV
}
\`\`\`

### 6.4. Complete Multi-Level Example

\`\`\`tonto
package vehicles.multilevel

// Base kind
kind Vehicle {
  serialNumber: string
  manufacturerDate: date
}

// Powertype - all possible vehicle types
powertype VehicleType

// Categorizer - classification by purpose
type VehiclePurposeType specializes VehicleType

// Vehicle categories by purpose
subkind PassengerVehicle (instanceOf VehiclePurposeType) specializes Vehicle
subkind CargoVehicle (instanceOf VehiclePurposeType) specializes Vehicle
subkind SpecialPurposeVehicle (instanceOf VehiclePurposeType) specializes Vehicle

disjoint complete genset VehiclesByPurpose {
  general Vehicle
  categorizer VehiclePurposeType
  specifics PassengerVehicle, CargoVehicle, SpecialPurposeVehicle
}

// Another categorizer - classification by propulsion
type PropulsionType specializes VehicleType

subkind ElectricVehicle (instanceOf PropulsionType) specializes Vehicle
subkind CombustionVehicle (instanceOf PropulsionType) specializes Vehicle
subkind HybridVehicle (instanceOf PropulsionType) specializes Vehicle

disjoint complete genset VehiclesByPropulsion {
  general Vehicle
  categorizer PropulsionType
  specifics ElectricVehicle, CombustionVehicle, HybridVehicle
}

// Specific types can be instances of multiple categorizers
subkind ElectricCar specializes PassengerVehicle, ElectricVehicle
\`\`\`

### 6.5. Key Differences

| **Powertype** | **Categorizer** |
|---------------|-----------------|
| Includes ALL specializations | Includes SPECIFIC subset |
| Base type IS an instance | Base type is NOT an instance |
| Universal classification | Criterion-based classification |
| \`powertype VehicleType\` | \`categorizer\` in genset |

## 7. Complete Working Examples

### 7.1. Simple University Ontology

\`\`\`tonto
package university.core

datatype Address {
  street: string
  city: string
  zipCode: string
  country: string
}

enum AcademicLevel {
  Undergraduate,
  Graduate,
  Doctoral
}

kind Person {
  name: string
  birthDate: date
  email: string [0..1]
  address: Address
}

kind University {
  name: string
  foundedYear: number
  mainAddress: Address
  @componentOf [1] <o>-- departments -- [1..*] Department
}

kind Department {
  name: string
  code: string
}

role Student specializes Person {
  studentId: string
  level: AcademicLevel
  [1] -- enrolledIn -- [1] University
}

role Professor specializes Person {
  employeeId: string
  [1] -- worksAt -- [1] Department
}

relator Enrollment {
  enrollmentDate: date
  semester: string
  @mediation [1..*] -- [1] Student
  @mediation [1..*] -- [1] Course
}

kind Course {
  code: string
  name: string
  credits: number
  [1] -- offeredBy -- [1] Department
}
\`\`\`

### 7.2. Healthcare System with Relators

\`\`\`tonto
package healthcare.system

kind Person {
  name: string
  birthDate: date
  ssn: string { const }
}

kind Hospital {
  name: string
  capacity: number
  [1] <>-- employs -- [1..*] Doctor
}

role Patient specializes Person {
  patientId: string
  bloodType: string
}

role Doctor specializes Person {
  licenseNumber: string { const }
  specialty: string
}

relator Appointment {
  appointmentDate: datetime
  reason: string
  diagnosis: string [0..1] { derived }
  @mediation [1..*] -- [1] Patient
  @mediation [1..*] -- [1] Doctor
}

mode HealthCondition {
  diagnosedDate: date
  severity: string
  @characterization [1..*] -- [1] Patient
}

event Treatment {
  treatmentDate: date
  description: string
  @participation [1..*] -- [1] Patient
  @participation [1..*] -- [1] Doctor
}
\`\`\`

### 7.3. Multi-Package Project with Imports

**File: core/persons.tonto**
\`\`\`tonto
package core.persons

kind Person {
  name: string
  birthDate: date
  email: string [0..1]
}

subkind Man specializes Person
subkind Woman specializes Person

disjoint complete genset Gender where Man, Woman specializes Person

phase Child specializes Person
phase Adult specializes Person

disjoint complete genset AgePhases where Child, Adult specializes Person
\`\`\`

**File: core/organizations.tonto**
\`\`\`tonto
package core.organizations

kind Organization {
  legalName: string
  taxId: string { const }
  foundedDate: date [0..1]
}

subkind Company specializes Organization {
  stockSymbol: string [0..1]
}

subkind NonProfit specializes Organization {
  missionStatement: string
}
\`\`\`

**File: employment/contracts.tonto**
\`\`\`tonto
import core.persons
import core.organizations

package employment.contracts

role Employee specializes core.persons.Person {
  employeeId: string
}

role Employer specializes core.organizations.Organization

relator EmploymentContract {
  startDate: date
  endDate: date [0..1]
  salary: number
  position: string
  @mediation [1..*] -- [1] Employee
  @mediation [1..*] -- [1] Employer
}

enum ContractType {
  FullTime,
  PartTime,
  Contractor,
  Intern
}

datatype ContractTerms {
  type: ContractType
  hoursPerWeek: number
  benefitsIncluded: boolean
}
\`\`\`

### 7.4. E-Commerce with Complex Relations

\`\`\`tonto
package ecommerce.sales

kind Product {
  sku: string { const }
  name: string
  description: string [0..1]
  basePrice: number
  stockQuantity: number
}

kind Customer {
  customerId: string
  name: string
  email: string
  registrationDate: date
}

relator Order {
  orderId: string { const }
  orderDate: datetime
  totalAmount: number { derived }
  status: OrderStatus
  @mediation [1..*] -- [1] Customer
}

relation Order [1] <>-- orderItems -- [1..*] OrderItem

kind OrderItem {
  quantity: number
  unitPrice: number
  lineTotal: number { derived }
  [1] -- product -- [1] Product
}

enum OrderStatus {
  Pending,
  Processing,
  Shipped,
  Delivered,
  Cancelled
}

datatype ShippingAddress {
  recipientName: string
  street: string
  city: string
  state: string
  zipCode: string
  country: string
}

event Purchase {
  purchaseDate: datetime
  paymentMethod: string
  @participation [1] -- [1] Customer
  @bringsAbout [1] -- [1] Order
}
\`\`\`

### 7.5. Vehicle Ontology with Multi-Level Modeling

\`\`\`tonto
package vehicles.complete

datatype Dimensions {
  length: number
  width: number
  height: number
}

enum FuelType {
  Gasoline,
  Diesel,
  Electric,
  Hybrid,
  Hydrogen
}

kind Vehicle {
  vin: string { const }
  manufacturer: string
  year: number
  dimensions: Dimensions
}

// Powertype for all vehicle types
powertype VehicleType

// Categorizer for classification by purpose
type PurposeType specializes VehicleType

subkind PassengerVehicle (instanceOf PurposeType) specializes Vehicle
subkind CargoVehicle (instanceOf PurposeType) specializes Vehicle
subkind MilitaryVehicle (instanceOf PurposeType) specializes Vehicle

disjoint complete genset VehiclesByPurpose {
  general Vehicle
  categorizer PurposeType
  specifics PassengerVehicle, CargoVehicle, MilitaryVehicle
}

// More specific passenger vehicles
subkind Car specializes PassengerVehicle {
  numberOfDoors: number
  trunkCapacity: number
}

subkind Bus specializes PassengerVehicle {
  passengerCapacity: number
  standingRoomAllowed: boolean
}

subkind Motorcycle specializes PassengerVehicle {
  engineDisplacement: number
}

// Phases based on condition
phase NewVehicle specializes Vehicle
phase UsedVehicle specializes Vehicle

disjoint complete genset VehicleCondition where NewVehicle, UsedVehicle specializes Vehicle

// Roles based on usage
role RentalVehicle specializes Vehicle {
  dailyRate: number
  [1] -- ownedBy -- [1] RentalCompany
}

role PrivateVehicle specializes Vehicle {
  [1] -- ownedBy -- [1] Person
}

kind RentalCompany {
  companyName: string
  [1] <>-- fleet -- [1..*] RentalVehicle
}

kind Person {
  name: string
  driverLicenseNumber: string [0..1]
}

relator VehicleOwnership {
  purchaseDate: date
  purchasePrice: number
  @mediation [1] -- [1] Vehicle
  @mediation [1] -- [1] Person
}

event VehicleSale {
  saleDate: datetime
  agreedPrice: number
  @participation [1] -- [1] Vehicle
  @participation [1] -- seller -- [1] Person
  @participation [1] -- buyer -- [1] Person
}
\`\`\`

## 8. QualifiedNames and Cross-Package References

**What are QualifiedNames?**
QualifiedNames are dot-separated identifiers (like \`package.subpackage.ClassName\`) that uniquely reference elements across packages. They're essential for modular ontologies.

**Why use QualifiedNames?**
- **Avoid name conflicts:** \`company.Person\` vs \`biology.Person\`
- **Enable modularity:** Reference types from other packages
- **Make dependencies explicit:** Clear which packages are used
- **Support large projects:** Organize ontologies into coherent modules

### 8.1. When to Use QualifiedNames

**Simple Names:** Use within the same package

When referencing elements declared in the current package, use simple names.

\`\`\`tonto
package mypackage

kind Person
kind Company

// Both types in same package - simple names work
relation Person [1] -- worksFor -- [1] Company
\`\`\`

**Qualified Names:** Required for cross-package references

When referencing imported elements, use the full qualified name from their package declaration.

\`\`\`tonto
import core.persons          // Imports the package
import core.companies

package employment

// Must use qualified names for imported elements
// Even though imported, must use full package.ClassName syntax
relation core.persons.Person [1] -- employs -- [1] core.companies.Company
\`\`\`

### 8.2. Package Aliases

Use aliases to shorten qualified names:

\`\`\`tonto
import core.persons as P
import core.companies as C

package employment

// Use alias prefix
role Employee specializes P.Person
role Employer specializes C.Company

relation Employee [1] -- worksFor -- [1] Employer
\`\`\`

### 8.3. Global Packages

Global packages can be referenced without imports:

\`\`\`tonto
// File: primitives.tonto
global package primitives

datatype UUID {
  value: string { const }
}

datatype Email {
  address: string
}
\`\`\`

\`\`\`tonto
// File: users.tonto
package users

// No import needed for global packages
kind User {
  id: primitives.UUID
  email: primitives.Email
}
\`\`\`

## 9. Common Syntax Errors and How to Avoid Them

### 9.1. Missing Imports

**ERROR:**
\`\`\`tonto
package mypackage

// Reference to Person from another package without import
role Employee specializes Person  // ERROR: Person not found
\`\`\`

**FIX:**
\`\`\`tonto
import core.persons

package mypackage

role Employee specializes core.persons.Person  // Correct
\`\`\`

### 9.2. Imports After Package Declaration

**ERROR:**
\`\`\`tonto
package mypackage

import core.persons  // ERROR: Import must come before package
\`\`\`

**FIX:**
\`\`\`tonto
import core.persons

package mypackage
\`\`\`

### 9.3. Missing Cardinality (Using Defaults)

Cardinality is OPTIONAL. Default is \`[1]\` (exactly one).

\`\`\`tonto
kind Person {
  name: string           // Same as: name: string [1]
  age: number [0..1]     // Optional, must be explicit
  tags: string [*]       // Multiple, must be explicit
}
\`\`\`

### 9.4. Incorrect Connector Direction

**Aggregation/Composition:**
- Diamond on SOURCE (aggregate/composite) side
- \`<>--\` or \`<o>--\` means "this class HAS/OWNS"

\`\`\`tonto
kind Car {
  [1] <o>-- hasEngine -- [1] Engine  // Car owns Engine
}

// NOT: [1] --<o> hasEngine -- [1] Engine (inverted, less common)
\`\`\`

### 9.5. Invalid Stereotype Combinations

**ERROR - Non-sortal specializing Sortal:**
\`\`\`tonto
kind Person
mixin Customer specializes Person  // ERROR: Mixin can't specialize Kind directly
\`\`\`

**FIX - Use proper hierarchy:**
\`\`\`tonto
kind Person
role Customer specializes Person  // Correct: Role can specialize Kind
\`\`\`

### 9.6. Missing Second Cardinality in Relations

Both cardinalities are optional but recommended for clarity:

\`\`\`tonto
kind Person {
  [1] -- worksFor -- Company        // Valid, but second cardinality unclear
  [1] -- worksFor -- [1] Company    // Better: explicit on both ends
}
\`\`\`

### 9.7. Forgetting \`instanceOf\` for Multi-Level

**ERROR:**
\`\`\`tonto
type AnimalSpecies

kind Dog specializes Animal  // Missing instanceOf
\`\`\`

**FIX:**
\`\`\`tonto
type AnimalSpecies

kind Dog (instanceOf AnimalSpecies) specializes Animal  // Correct
\`\`\`

## 10. Best Practices with Tonto

*   **Modular Design:**
    *   Use separate \`.tonto\` files (packages) for distinct conceptual domains or modules of your ontology.
    *   Employ \`import\` statements to reuse elements from other packages, promoting a clean and organized project structure.
**Clear Naming:**
- Use descriptive, unambiguous names for all elements
- PascalCase for types (Person, Company, AcademicLevel)
- camelCase for attributes and relation ends (firstName, worksAt)
- Relators named as nouns representing the relationship (Marriage, Employment)
- Roles reflecting the role played (Student, Employee, Customer)

**Accurate Stereotyping:**
- Choose stereotypes carefully based on UFO principles
- Avoid overusing generic \`class\` - specify the proper stereotype
- Understand rigidity: kinds/subkinds are rigid, phases/roles are anti-rigid
- Ensure sortals ultimately specialize an ultimate sortal (kind, collective, etc.)

**Precise Cardinalities:**
- Define cardinalities explicitly for clarity
- Use \`[0..1]\` for optional attributes/relations
- Use \`[*]\` or \`[1..*]\` for collections
- Specify both ends of relations for clarity

**Ontological Natures:**
- Use \`of <nature>\` for non-sortals to specify allowed natures
- Example: \`category PhysicalEntity of objects\`
- Helps constrain what can instantiate the non-sortal

**Internal vs External Relations:**
- Internal: Use for part-whole relations and when the source class "owns" the relation
- External: Use for cross-package relations or to keep class bodies clean
- Always use appropriate stereotypes (\`@mediation\`, \`@componentOf\`, etc.)

**Leverage Tooling:**
- Pay attention to validation errors and warnings

## 11. Project Structure and Organization

**Why Structure Matters:**
Well-organized Tonto projects are easier to maintain, understand, and reuse. Good structure supports modularity, version control, and collaboration.

### 11.1. Typical Project Structure

\`\`\`
my-ontology/
├── tonto.json           # Manifest file (metadata, dependencies)
├── src/                 # Source .tonto files (your ontology definitions)
│   ├── core/           # Core domain concepts (folder for organization)
│   │   ├── persons.tonto
│   │   └── organizations.tonto
│   ├── business/       # Business-specific concepts
│   │   └── employment.tonto
│   └── main.tonto      # Main/entry ontology
├── lib/                 # External dependencies (installed by tpm)
└── generated/           # Output directory (generated artifacts)
    ├── ontology.json    # JSON serialization
    └── gufo.ttl         # GUFO transformation
\`\`\`

**Directory Purposes:**
- **\`src/\`**: Your source ontology files - version controlled
- **\`lib/\`**: External ontologies you depend on - managed by \`tpm\` (like node_modules)
- **\`generated/\`**: Build outputs - usually NOT version controlled

### 11.2. Understanding Packages: Files, Not Folders

**Critical Concept:** A package is defined by a \`.tonto\` FILE's package declaration, NOT by directory structure.

**This is different from Java/Python:**
- In Java: folder structure mirrors package structure
- In Tonto: packages are explicit declarations, folders are just for organization

**Why this matters:**
- Flexible organization: put files anywhere
- Explicit dependencies: imports use declared package names
- No magic: what you declare is what you get

**Example:**
- File \`src/core/persons.tonto\` declares \`package core.persons\`
  - The package name is \`core.persons\` (from the declaration)
  - The file could be anywhere - the folder doesn't matter
- File \`src/core/organizations.tonto\` declares \`package core.organizations\`
  - Different package, even though in same folder
- The \`core/\` folder is just for YOUR organization
  - There is NO automatic \`core\` package
  - If you want a \`core\` package, create \`core.tonto\` with \`package core\`

**Imports use package names, not file paths:**
\`\`\`tonto
import core.persons      // Refers to the declared package name "core.persons"
import core.organizations // Not the file path!

package mypackage
// ... use core.persons.Person
\`\`\`

**Best Practice:**
Match folder structure to package structure for clarity, but understand they're independent:
\`\`\`
src/core/persons.tonto → package core.persons  ✓ Clear
src/unrelated/persons.tonto → package core.persons  ✓ Valid but confusing
\`\`\`

### 11.3. The tonto.json Manifest

\`\`\`json
{
  "name": "my-ontology",
  "version": "1.0.0",
  "description": "My ontology description",
  "dependencies": {
    "some-external-ontology": "^1.2.0"
  }
}
\`\`\`

### 12.1. Tonto Package Manager (tpm)

**Install dependencies:**
\`\`\`bash
tpm install                             # Installs deps from tonto.json
\`\`\`

**Add a dependency:**
\`\`\`bash
tpm add some-ontology-package           # Adds and installs dependency
\`\`\`

## 13. LLM Workflow Guidelines

**When working with Tonto projects:**

1. **Read the Grammar First:** Consult sections 1-6 to understand syntax
2. **Examine Examples:** Review section 7 for patterns matching the task
3. **Check for Errors:** Always validate after making changes
4. **Use Qualified Names:** For cross-package references (section 8)
5. **Avoid Common Errors:** Review section 9 before generating code
6. **Follow Best Practices:** Apply guidelines from section 10

**Always check linter errors** to ensure ontological correctness and adherence to UFO principles.

## 14. Ontological Natures Reference

**Valid natures for \`of\` clause:**
- \`objects\` - Shortcut for functional-complexes, collectives, or quantities
- \`functional-complexes\` - Individual objects with parts  
- \`collectives\` - Collections of similar members
- \`quantities\` - Amounts of matter
- \`relators\` - Truth-makers of material relations
- \`intrinsic-modes\` - Intrinsic moments
- \`extrinsic-modes\` - Externally dependent moments
- \`qualities\` - Measurable/comparable properties
- \`events\` - Occurrences/happenings
- \`situations\` - States of affairs
- \`types\` - Higher-order types
- \`abstract-individuals\` - Abstract entities

**Usage:**
\`\`\`tonto
category PhysicalObject of objects
category Agent of functional-complexes, collectives
phaseMixin InsuredItem of objects, collectives
\`\`\`

## 15. Built-in Data Types

Tonto provides standard built-in data types:

- \`string\` - Text values
- \`number\` - Numeric values (integer or floating-point)
- \`boolean\` - True/false values
- \`date\` - Date values (year-month-day)
- \`time\` - Time values
- \`datetime\` - Combined date and time values

**Usage in attributes:**
\`\`\`tonto
kind Person {
  name: string
  age: number
  isActive: boolean
  birthDate: date
  lastLogin: datetime
}
\`\`\`

---

## Summary

This guide provides a complete reference for Tonto - both grammar syntax and ontological meaning. 

**Key Takeaways:**

1. **Tonto is UFO-based** - Every construct has ontological semantics from UFO
   - Syntax: Follow patterns exactly as shown in examples
   - Meaning: Understand why each stereotype/construct exists

2. **Stereotypes are crucial** - They define ontological meta-properties
   - Kinds provide identity, phases/roles are anti-rigid
   - Relators ground material relations
   - Choose based on rigidity, sortality, and dependence

3. **Imports before package** - Always declare imports first
   - QualifiedNames for cross-package refs: Use package.Class syntax
   - Packages are files, not folders - explicit declaration matters

4. **Cardinalities constrain multiplicity** - Default is [1]
   - Be explicit for clarity: [0..1] optional, [*] multiple, [1..*] required multiple
   - Meta-attributes add semantics: ordered, const, derived

5. **Relations have rich semantics** - Internal/external, stereotyped, with meta-attributes
   - @mediation connects relators to participants
   - @characterization connects moments to bearers
   - @componentOf for part-whole, @participation for events

6. **Gensets express constraints** - Use disjoint/complete to formalize taxonomies
   - Disjoint: mutually exclusive
   - Complete: exhaustive coverage
   - Together: partition (exactly one)

7. **Multi-level modeling** - Types can be instances of higher-order types
   - Use instanceOf to link levels
   - Powertype: ALL specializations
   - Categorizer: criterion-based subset (more common)

8. **Examples are your friend** - Refer to section 7 for complete working code
   - University, Healthcare, E-commerce, Vehicles, Multi-package

9. **Ontology as code** - Version control, modularity, automated validation
    - Modular design with packages
    - Reusable datatypes and enums
    - Clear naming and documentation

**Use this guide to generate syntactically correct and ontologically sound Tonto code.**
`;
