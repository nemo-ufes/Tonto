<div id="top"></div>


<!-- [![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url] -->


<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/nemo-ufes/Tonto">
    <img src="docs/images/TontoLogo.png" alt="Logo"  height="100" alt="Tonto Logo image, a blue background with TONTO written in it">
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
    <li><a href="#packages">Packages separation</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#prerequisites">Prerequisites</a></li>
  </ol>
</div>


<!-- ABOUT THE PROJECT -->
<div id="about-the-project"> </div>

## 📝 About The Project

Tonto is an acronym with the words Textual and Ontology, because it is a written way of writing Ontology models. It was developed using the `Langium` tool, with `Typescript`, and creates a Visual Studio Code Extension with a Language server. 

Tonto was designed as a friendly textual syntax for ontologies. It offers specialized support for constructs reflecting the UFO foundational ontology, which makes it possible to identify errors in the ontology that would otherwise pass unnoticed. The language was designed to allow transformation to a number of languages including UML (more specifically OntoUML), OWL (for gUFO-based ontologies), Alloy, Common Logic, and the TPTP syntax.

### The language supports:
- Declaration of OntoUML constructs in a easy-to-read syntax
- Enumerations and custom datatypes
- High-order types for multi-level taxomies

As a textual syntax, the language can benefit from source control tools such as git, and ontologies can be viewed and edited without special tools. This VS Code extension is provided with support for syntax verification, syntax highlight, content assist and ontology visualization preview. The extension is integrated with the [OntoUML](https://github.com/OntoUML/OntoUML) server, to benefit from services designed for the language, such as transformation to OWL and generation of database schemas.

<p align="right">(<a href="#top">back to top</a>)</p>


<div id="built-with"> </div>

### 🔨 Built With

Here are some of the languages, frameworks, tools and libraries used in development of this application:

* [Typescript](https://www.typescriptlang.org/)
* [Langium](https://langium.org/)

<p align="right">(<a href="#top">back to top</a>)</p>


<!-- PACKAGES -->
##  Packages

This project is divided in 3 packages, each of them responsible for a different part of Tonto.

### [Tonto Grammar and CLI](packages/tonto/)
- This package is where Tonto Grammar, the Language Server Protocol and the CLI is defined. All elements and commands are available in this package, and you can read more about it here:

### [Tonto Extension](packages/tonto-vscode/)
- This package is responsible for the [VSCode Extension](https://marketplace.visualstudio.com/items?itemName=Lenke.tonto)

### [Tonto Package Manager](packages/tonto-package-manager/)
- This package is responsible for the `Tonto Package Manager (TPM)`. The TPM provides a way to manage ontologies as sepparate packages, simmilarly to how programming languages work.

<p align="right">(<a href="#top">back to top</a>)</p>

#### 4.1 Visual Studio Code Extension

The Tonto VS Code extension provides a rich editing experience with features like:

*   Real-time syntax verification
*   Syntax highlighting
*   Autocompletion
*   Code snippets
*   Transformation to OntoUML (JSON) and gUFO-based OWL
*   Visualization of diagrams

#### 4.2 Tonto Package Manager (TPM)

TPM enables managing dependencies between Tonto projects, facilitating code reuse and modular development.


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
#### Tasks
This project defines tasks in order to be easier for vscode to build everything. 

1. If you want to build all packages in watch mode just press `cmd` + `shift` + `b` or the equivalent command to run the build task.

2. After that, select at the debug tab the `Run Extension` command or press `F5` to run the extension in a sepparate Extension Development Host.

3. Create a new file with a file name suffix `.tonto` and start using Tonto 

 ### Packaging the extension

> With these commands you can generate a .vsix file to install the extension in your VS Code or to send privately to other people to test it, without publishing it to the Marketplace

 ```bash
  # Run this to generate .vsix file
  npm run package
  # Or
  vsce package --pre-release --baseContentUrl https://github.com/nemo-ufes/Tonto

  # Installing the extension in your vscode (requires the code extension in path)
  code --install-extension tonto-x.x.x.vsix
 ```

### Publishing

You can Publish the `tonto-cli` to npm and the Visual Studio Code extension to the extension marketplace

In order to publish the extension, you need to configure your azure key and your npm key locally.

Then, inside the `tonto` or `tonto-vscode` folder, run the following command:

```bash
    npm run publish
```
<!-- LICENSE -->
## 🔐 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#top">back to top</a>)</p>

<div id="contact"> </div>

<!-- CONTACT -->
## ✉️ Contact


Matheus Lenke Coutinho - matheus.l.coutinho@edu.ufes.br - [Linkedin](https://www.linkedin.com/in/matheus-lenke-coutinho-492a4b15a/) - [Github](https://github.com/matheuslenke)

<div id="additional-tools"> </div>

<p align="right">(<a href="#top">back to top</a>)</p>
