import { Command } from "commander";
import { TontoLanguageMetaData } from "../language/index.js";
import { TontoActions } from "./actions/actions.js";
import { addSkillCommand } from "./actions/commands/addSkillCommand.js";
import { initCommand } from "./actions/commands/initCommand.js";

export const cliVersion = "0.4.14";

export function createCli(actions = new TontoActions()): Command {
    const program = new Command();

    program
        .name("tonto-cli")
        .description("A CLI to run commands in your Tonto project")
        .version(cliVersion);

    const fileExtensions = TontoLanguageMetaData.fileExtensions.join(", ");

    program
        .command("generate")
        .argument("<dir>", "Directory of the actual project")
        .option("-d, --destination <dir>", "Destination directory of generating")
        .description("Generate JSON from your project")
        .action(actions.generateAction);

    program
        .command("generateSingle")
        .argument(
            "<file>",
            `Generate on single file projects providing source file (possible file extensions: ${fileExtensions})`
        )
        .option("-d, --destination <dir>", "Destination of generated JSON file")
        .action(actions.generateSingleAction)
        .description("Generate JSON from your project or a single file");

    program
        .command("import")
        .argument("<file>", "source file (possible file extensions: json)")
        .option("-d, --destination <dir>", "destination directory of generating")
        .description("generates a tonto file from a JSON file")
        .action(actions.importAction);

    program
        .command("importSingle")
        .argument("<file>", "source file (possible file extensions: json)")
        .option("-d, --destination <dir>", "destination directory of generating")
        .description("generates a single tonto file from a JSON file")
        .action(actions.importSingleAction);

    // program
    //   .command("viewDiagram")
    //   .argument("<file>", "source file (possible file extensions: tonto)")
    //   .description("generates a diagram from a tonto file")
    //   .action(viewAction);

    program
        .command("validate")
        .argument("<dir>", "Directory of the actual project")
        .option("--with-api", "Validate with the ontouml-js API in addition to local checks")
        .description("Validate your Tonto project locally")
        .action(actions.validateAction);

    program
        .command("transform")
        .argument("<dir>", "Directory of the actual project")
        .description("Transform you Tonto project to gufo with the ontouml-js API")
        .action(actions.transformToGufoAction);

    program
        .command("transformToAlloy")
        .argument("<dir>", "Directory of the actual project")
        .description("Transform your Tonto project to Alloy with the ontouml-js API")
        .action(actions.transformToAlloyAction);

    program
        .command("plantuml")
        .argument("<dir>", "Directory of the actual project")
        .option("-d, --destination <dir>", "Destination directory for generated PlantUML files")
        .option("--per-package", "Generate one PlantUML file per package")
        .option("--no-external-references", "Hide references outside each generated package")
        .option("--layout <variant>", "Layout variant: default, top-to-bottom, left-to-right, polyline, orthogonal, smetana, elk", "default")
        .description("Generate PlantUML diagram source from your Tonto project")
        .action(actions.generatePlantUMLAction);

    program.addCommand(initCommand());
    program.addCommand(addSkillCommand());

    return program;
}

export default async function main(argv = process.argv): Promise<void> {
    await createCli().parseAsync(argv);
}

export * from "./actions/index.js";
export * from "./requests/jsonGeneration.js";
export * from "./requests/tontoGeneration.js";
export * from "./model/grammar/TontoManifest.js";
export * from "./requests/gufoTransform.js";
export * from "./requests/alloyTransform.js";
export * from "./actions/commands/generateAlloyCommand.js";
export * from "./requests/ontoumljsValidator.js";
export * from "./utils/buildFolderDocuments.js";
export * from "./utils/readManifest.js";
