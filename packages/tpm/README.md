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

  <h3 align="center">Tonto Package Manager</h3>

</div>

<div height="200">
</div>

&nbsp;

<!-- TABLE OF CONTENTS -->



<!-- ABOUT THE PROJECT -->
<div id="about-the-project"> </div>

# 📝 About The Project

Tonto Package Manager is a Package Manager created to help you manage your Tonto projects. With
 it, it's possible to modularize your OntoUML projects, creating a better organization and 
 separation of contexts. Each tonto project needs a `tonto.json` manifest file that provides 
 necessary information to TPM works properly. All dependencies are installed in the `tonto_dependencies` folder.

## The manifest file tonto.json

```json
{
  "projectName": "Aguiar2019ooco",
  "displayName": "Aguiar 2019 Object Oriented Example",
  "publisher": "Aguiar",
  "version": "1.0.0",
  "license": "MIT",
  "dependencies": {
    "SWO": {
      "url": "https://github.com/matheuslenke/tonto-example-models.git",
      "directory": "SWO",
      "branch": "feature/test-tonto-reference"
    },
    "SPO": {
      "url": "https://github.com/matheuslenke/tonto-example-models.git",
      "directory": "SPO"
    }
  },
  "outFolder": "outDirectory"
}
```
Here, you can see how you can define your project and it's dependencies. You can define
 dependencies using a branch or a version tag created on the repository, and even defining a 
 directory in case you have multiple projects in the same repository.

 ### Dependency definition
 
```json
"dependencies": {
  "DependencyA": {
    "url": "https://github.com/name/repo-name.git",
    "directory": "A",
    "branch": "feature/testA"
  },
  "DependencyB": {
    "url": "https://github.com/name/repo-name.git",
    "directory": "B",
    "version": "1.0.1"
  },
  "DependencyC": {
    "url": "https://github.com/name/repo-name.git",
    "directory": "C"
  },
  "DependencyD": {
    "url": "https://github.com/name/repo-name.git"
  }
```
Observations:

- In case you **don't** define any version or branch, it get's the master branch of your repository.
- If you define a version, there must exist a tag in this repository with the exact same name
- Sometimes you might need to delete the tonto_modules folder and install everything again
# 🔨 Commands
Description of the available commands at TPM

## Install
The first and most important one is the install command. With it, TPM will download your dependencies from a github repository. You can use it like that at the root directory of your project, the same containing the tonto.json file.
```bash
tpm install
```

## Add dependency
This command adds a dependency. The commands inside of "<>" are required, however the commands inside of "[]" are optional.
```bash
tpm add -n <dependencyName> -u <gitUrl> -v [projectVersion] -d [DependencyDirectory]
```

## Help
This command shows help for any command if you need to get more info
```bash
tpm help
tpm install help
tpm add help
```



<p align="right">(<a href="#top">back to top</a>)</p>

<!-- LICENSE -->
## 🔐 License

Distributed under the MIT License. See the repository's root `LICENSE` file for more information.

<p align="right">(<a href="#top">back to top</a>)</p>

<div id="contact"> </div>

<!-- CONTACT -->
## ✉️ Contact


Matheus Lenke Coutinho - matheus.l.coutinho@edu.ufes.br - [Linkedin](https://www.linkedin.com/in/matheus-lenke-coutinho-492a4b15a/) - [Github](https://github.com/matheuslenke)

<div id="additional-tools"> </div>

<p align="right">(<a href="#top">back to top</a>)</p>
