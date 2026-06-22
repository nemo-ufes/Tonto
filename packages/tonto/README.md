<div id="top"></div>


<!-- [![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url] -->


<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/nemo-ufes/Tonto">
    <img src="../../docs/images/TontoLogo.png" alt="Logo"  height="100" alt="Tonto Logo image, a blue background with TONTO written in it">
  </a>

  <h3 align="center">An DSL for Ontology models</h3>

</div>

<div height="200">
</div>

&nbsp;

<!-- TABLE OF CONTENTS -->


<div>
  <h1><summary>Table of Contents</summary></h1>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#prerequisites">Prerequisites</a></li>
  </ol>
</div>


<!-- ABOUT THE PROJECT -->
<div id="about-the-project"> </div>

## Tonto CLI

Tonto Command Line Interface (CLI) is a tool that expands the use of Tonto models by enabling the transformation of Tonto projects into other formats and providing validation capabilities.

### Functionalities

1.  **Transformation to JSON:** The `generate` command converts a Tonto model into a JSON file that adheres to the OntoUML JSON schema. This allows for interoperability with OntoUML tools and further processing.
    ```bash
    tonto-cli generate [directoryName]
    ```
2.  **Import from JSON:** The `import` command takes a JSON file conforming to the OntoUML JSON schema and generates a corresponding Tonto project. This facilitates the migration of existing OntoUML models to Tonto.
    ```bash
    tonto-cli import [jsonFileName]
    ```
3.  **Transformation to OWL:** The `transform` command converts a Tonto model into a gUFO-based OWL ontology using the Turtle syntax. This bridges the gap between conceptual models and formal ontologies used in the Semantic Web.
    ```bash
    tonto-cli transform [directoryName]
    ```
4.  **Validation:** The `validate` command sends the Tonto model to the `ontouml-server` API for validation. It returns any validation errors identified by the server, helping to ensure the model's correctness and adherence to OntoUML/UFO rules.
    ```bash
    tonto-cli validate [directoryName]
    ```
5.  **PlantUML diagram generation:** The `plantuml` command creates PlantUML diagram source for the whole ontology. Use `--per-package` to generate one diagram file per package.
    ```bash
    tonto-cli plantuml [directoryName]
    tonto-cli plantuml [directoryName] --per-package
    ```

### Installation and Usage

Tonto CLI is available as an NPM package. To install it globally, use the following command:

```bash
npm install -g tonto-cli
```

Once installed, you can use the `tonto-cli` command followed by the desired command and directory or file name to perform the corresponding action.

### Additional Considerations

*   **Node.js Requirement:** Tonto CLI requires Node.js to be installed on your system.
*   **Global Installation:** Installing Tonto CLI globally allows you to use the `tonto-cli` command from any directory.



<!-- Tonto Grammar -->
## Language Elements
<div id="language-elements" />

Tonto grammar allows you declare elements by using its keyword and the defined name for the element.

```java
package example 

kind Person {
    name: String
    age: Integer
    gender: Gender
}

phase Child specializes Person

enum Gender {
    MALE
    FEMALE
    OTHER
}

relation Person [0..*] -- hasFriend -- [0..*] Person
```
### Package Declarations
Tonto specifications are organized into packages, defined using the package keyword followed by the package name. Packages act as namespaces and are fundamental for modularity.

```java
package myPackage
```

### Class Declarations
Classes are declared using keywords corresponding to UFO types (e.g., kind, role, phase) followed by the class name. Specializations are indicated using the specializes keyword.
```java
kind Person {
    name: string
    birthDate: date {const}
}

phase Child specializes Person
```

### Datatype Declarations
Tonto supports built-in datatypes (number, string, boolean, date, time, datetime) and allows defining custom datatypes using the datatype keyword.
```
datatype Address {
    street: string
    number: int
}
```

### Enumeration Declarations
Enumerations are declared using the enum keyword, listing possible literal values.
```
enum EyeColor { Blue, Green, Brown, Black }
```

### Generalization Sets

Generalization sets define relationships between a general class and its specializations. They can be marked as disjoint and/or complete.
```java
disjoint complete genset PersonAgeGroup where Child, Adult specializes Person

genset PersonAgeGroup {
    general Person
    specifics Child, Adult
}
```

### Relations
Relations (associations) can be declared internally (within a class body) or externally. They are specified using relation stereotypes (e.g., @componentOf, @mediation) and cardinalities.

```java
// Internal relation
kind University {
    @componentOf [1] <>-- [1..*] Department
}

// External relation
@mediation relation EmploymentContract [1..*] -- [1] Employee
```

<div id="getting-started"> </div>

<!-- GETTING STARTED -->
## ⌨️ Getting Started

This is the instructions on setting up your project locally. To get a local copy up and running follow these simple example steps:


<div id="prerequisites"> </div>

### Prerequisites

This is all the tools you need installed to run the project and the versions that are preferred
* nodejs - v16.9.1 or higher
* npm - 7.21.1 or higher
* Yarn - 1.22.18 (not mandatory, but recommended)


### ⚙️ Initializing

 * Run `npm run langium:generate` to generate TypeScript code from the grammar definition.
 * Run `npm run build` to compile all TypeScript code or `npm run watch` if you want the compiler to work automatically everytime you update your files
 * Press `F5` to open a new window with your extension loaded.
 * Create a new file with a file name suffix matching your language.
 * Verify that syntax highlighting, validation, completion etc. are working as expected.


 ### CLI Commands

 - Help command to list all available commands
 ```bash
    tonto-cli help
 ```
- Generate JSON File from Tonto Project command::
 ```bash
    tonto-cli generate <dirName>
 ```
- Generate Tonto Project from a JSON Filee
 ```bash
    tonto-cli import <fileName.json>
 ```
- Validate Tonto Project with [ontouml-js](https://github.com/OntoUML/ontouml-js) server APII
 ```bash
    tonto-cli validate <dirName>
 ```
- Generate PlantUML diagram source for a Tonto Project
 ```bash
    tonto-cli plantuml <dirName>
    tonto-cli plantuml <dirName> --per-package
 ```
<!-- LICENSE -->>
## 🔐 License

Distributed under the MIT License. See `LICENSE.md` for more information.

<p align="right">(<a href="#top">back to top</a>)</p>

<div id="contact"> </div>

<!-- CONTACT -->
## ✉️ Contact


Matheus Lenke Coutinho - matheus.l.coutinho@edu.ufes.br - [Linkedin](https://www.linkedin.com/in/matheus-lenke-coutinho-492a4b15a/) - [Github](https://github.com/matheuslenke)

<div id="additional-tools"> </div>

<p align="right">(<a href="#top">back to top</a>)</p>
