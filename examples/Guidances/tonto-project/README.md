# Welcome To Your New Tonto Project: {{projectName}}

This sample README is the minimal project-level guide created for a new Tonto project. Replace the placeholder name and extend it with domain-specific modeling notes as the ontology grows.

## Project Structure

```text
{{projectName}}/
|-- src/
|   `-- main.tonto
|-- tonto.json
`-- README.md
```

## Getting Started

Edit the `.tonto` files under `src`. Each file declares a package and contains the ontology elements for that package.

```tonto
package example

kind Person {
    name: string
}
```

Validate and generate outputs from the project root:

```bash
tonto-cli validate .
tonto-cli generate .
tonto-cli plantuml .
```

## Next Steps

- Add one package per coherent part of the domain.
- Use OntoUML/UFO stereotypes intentionally, such as `kind`, `subkind`, `phase`, `role`, and `relator`.
- Add relations with explicit cardinalities.
- Keep generated artifacts out of the source model unless your team decides to version them.
