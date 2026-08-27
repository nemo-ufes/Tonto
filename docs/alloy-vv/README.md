# Tonto → Alloy: verificação e validação de ontologias

Este documento cobre a transformação de projetos Tonto em especificações
[Alloy](https://alloytools.org/), para validar e verificar ontologias bem fundadas gerando
instâncias e mundos possíveis a partir do modelo.

Trabalho de mestrado de Gabriel Borges no [NEMO](https://nemo.inf.ufes.br/) / UFES,
orientado pelo Prof. Dr. João Paulo A. Almeida.

---

## Situação

| Etapa | Situação |
|---|---|
| CLI `tonto transformToAlloy` gera `.als` | ✅ disponível |
| Comando na paleta do VS Code | ✅ disponível |
| Geração de instâncias dentro do editor | ✅ disponível |
| Visualização de mundos possíveis | ⬜ planejado |

---

## Uso

### No VS Code

Rode **Tonto: Transform to Alloy** na paleta de comandos, ou use a entrada
*Transform Tonto → Alloy* no grupo **Transformations** da barra lateral do Tonto. Ao
terminar, a notificação oferece abrir o `main.als` gerado.

### Gerando instâncias

**Tonto: Generate Instances (Alloy)** na paleta, ou pelo grupo **Model** da barra lateral.
Escolha um predicado — `singleWorld`, `linearWorlds` ou `multipleWorlds` — e a instância
aparece num painel, com um botão para avançar para a próxima.

Esse comando **não escreve arquivo**: a transformação acontece em memória, porque gerar
instâncias é uma pergunta sobre o modelo, não um artefato. Use *Transform to Alloy* quando
quiser os `.als` em disco.

Requer o servidor [`ontouml-alloy-lsp`](https://github.com/gabrielzborges/ontouml-alloy-lsp).
Enquanto ele não é empacotado junto com a extensão, aponte para uma compilação local:

```jsonc
// settings.json
"tonto.alloy.serverPath": "<repo>/build/install/ontouml-alloy-lsp/bin/ontouml-alloy-lsp"
```

`tonto.alloy.javaPath` define o Java usado; por padrão, `JAVA_HOME` e depois o `PATH`.

### Na linha de comando

```bash
tonto-cli transformToAlloy <diretório-do-projeto>
```

Escreve três módulos Alloy em `<outFolder>/alloy/`, onde `outFolder` vem do `tonto.json`:

| Arquivo | Conteúdo |
|---|---|
| `main.als` | signatures e fatos derivados das classes e relações da ontologia |
| `world_structure.als` | estrutura de mundos possíveis contra a qual o modelo é interpretado |
| `ontological_properties.als` | axiomas de rigidez, antirrigidez e imutabilidade |

Os três **precisam ficar no mesmo diretório**: `main.als` faz
`open world_structure[World]` e `open ontological_properties[World]`, e o Alloy resolve
`open foo` como `foo.als` ao lado do arquivo.

Abra `main.als` no Alloy Analyzer e execute um dos predicados `run` que a transformação
emite — `singleWorld`, `linearWorlds` ou `multipleWorlds`.

---

## Requisitos

- **Node.js** ≥ 16 e **npm** ≥ 7.7 (mesmos do repositório).
- **Alloy Analyzer 5.1.0** para abrir os arquivos gerados — ver a ressalva de versão abaixo.
- Java 17+ **apenas** para as fases futuras (servidor Alloy); nada de Java é necessário para
  gerar os `.als`.

### ⚠️ Versão do Alloy: use a 5, por ora

A transformação emite o builtin `disjoint[...]`, válido no **Alloy 5**. No **Alloy 6** esse
builtin foi renomeado para `disj[...]`, e os arquivos gerados falham ao carregar com:

```
The name "disjoint" cannot be found.
```

Verificado nos arquivos gerados, com os 6 comandos `run`, executados sem interface:

| Alloy | Resultado |
|---|---|
| 5.1.0 | ✅ parseia; 6/6 comandos SAT |
| 6.2.0 | ❌ não parseia |

A transformação está correta para a versão que ela mirava: a monografia é de 2021 e o
Alloy 6 saiu em novembro de 2021. A troca para `disj[...]` — que funciona nas **duas**
versões — está em discussão com o NEMO e não foi aplicada aqui.

---

## Arquitetura

A cadeia espelha a da transformação para gUFO, uma camada por responsabilidade:

```
packages/extension
 └─ commands/alloyTransformCommand.ts      paleta, barra lateral, notificações
                    │
packages/tonto      │  (ambos chamam a mesma camada de comando)
 └─ cli/main.ts     │                      registra o subcomando "transformToAlloy"
     └─ actions/actions.ts                 saída no console e escrita dos arquivos
         └─ actions/commands/generateAlloyCommand.ts    .tonto → Project OntoUML
             └─ requests/alloyTransform.ts              Project → Alloy
```

A extensão não duplica conhecimento de Alloy: importa `transformToAlloyCommand`,
`isAlloyResultResponse` e `getAlloyModules` do `tonto-cli`.

### O adapter é isolado de propósito

**`src/cli/requests/alloyTransform.ts` é o único arquivo do Tonto que importa
`Ontouml2Alloy`.** Pesquisadores do NEMO estão reescrevendo essa transformação, e
`Ontouml2Alloy.run()` é tipado como `{ result: any }` — ou seja, o compilador não protege
nada. As duas coisas ficam contidas nesse arquivo:

- **`AlloyModelBundle`** é o tipo que o resto do Tonto consome. Os nomes de campo crus não
  aparecem em nenhum outro lugar.
- **`toAlloyModelBundle()`** valida o payload em runtime e falha com mensagem acionável, em
  vez de escrever `undefined` dentro de um `.als`.
- **`getAlloyModules()`** concentra quantos módulos existem e como se chamam.

Ao mudar de versão do `ontouml-js`, este é o único arquivo que precisa acompanhar.

### Validação de pré-voo

A transformação deriva identificadores Alloy com `element.getName().replace(...)`, sem
checagem de nulo. Elemento sem nome produz `TypeError: Cannot read properties of null`, sem
indicar qual. `validateProjectForAlloyTransform()` roda antes e aponta o elemento.

Cada regra foi verificada contra a transformação, e não copiada da validação do gUFO:

| Exigido | **Não** exigido |
|---|---|
| nome de classe (inclui datatype e enumeration) | nome de relação |
| nome de atributo | nome de pacote |
| nome de literal de enumeration | cardinalidade personalizada |
| tipo nas duas pontas de cada relação | nome de generalization set |

Exigir nome de relação ou de pacote — como faz o gUFO — rejeitaria modelos OntoUML
perfeitamente válidos.

---

## Dependência: `ontouml-js`

`Ontouml2Alloy` vem de
[`matheuslenke/ontouml-js`](https://github.com/matheuslenke/ontouml-js), branch
`feature/include-types-in-build`, que é a que o Tonto já consumia.

⚠️ **Essa branch versiona o `dist/` compilado e não tem script `prepare`.** Quem instala
recebe o bundle que está no repositório; nada é compilado na instalação. Publicar mudança
só em `src/` não tem efeito nenhum sobre consumidores — o `dist/` precisa ser reconstruído:

```bash
npm install --legacy-peer-deps   # conflito pré-existente entre ts-jest@24 e jest@26
node esbuild.js                  # dist/index.js (bundle) + sourcemap
npm run build:types              # arquivos .d.ts
npm run build:alias
```

Note que `npm run build` **não** serve: roda babel e emite um `.js` por arquivo, layout
diferente do bundle versionado.

Como o lockfile fixa um commit exato, atualizar a dependência exige re-resolver:

```bash
npm update ontouml-js
node -e "console.log(typeof require('ontouml-js').Ontouml2Alloy)"   # deve imprimir: function
```

---

## Testes

```bash
cd packages/tonto && npx vitest run test/unit/requests/alloyTransform.test.ts
```

Cobrem o caminho feliz, a presença dos predicados de mundos possíveis, cada ramo da
validação, e dois invariantes que quebram silenciosamente se forem violados:

- os nomes dos arquivos `.als` acompanham as declarações `module` do conteúdo gerado
  (senão o projeto deixa de carregar no Analyzer, sem erro nenhum do Tonto);
- relações sem nome continuam válidas (proteção contra copiar a validação do gUFO).

⚠️ Os projetos de exemplo do repositório (`examples/University`, `examples/Guidances`,
`examples/Aguiar2019ooco`) falham **antes** da transformação, na geração Tonto → OntoUML.
É defeito pré-existente e não relacionado: `tonto-cli transform` (gUFO) falha igual nos
mesmos exemplos. Para testar ponta a ponta, use um projeto Tonto pequeno próprio.

---

## Leitura de apoio

- Benevides et al., *Validating ontology-driven conceptual models with Alloy* — a abordagem
  de mundos possíveis que orienta este trabalho.
  <https://www.sciencedirect.com/science/article/abs/pii/S0169023X2200043X>
- Musso, F. A. *An OntoUML 2.0 to Alloy transformation for the OntoUML Server*, UFES, 2021 —
  a transformação que o `Ontouml2Alloy` implementa.
- Jackson, D. *Software Abstractions: Logic, Language, and Analysis*, MIT Press.
