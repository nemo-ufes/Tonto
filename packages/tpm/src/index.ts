import { Command } from "commander";
import figlet from "figlet";
import { createRequire } from "node:module";
import { installAction } from "./actions/installAction.js";
import { addDependencyAction } from "./actions/addDependencyAction.js";

const require = createRequire(import.meta.url);
const packageVersion = (require("../package.json") as { version: string }).version;

export function createTpmProgram(): Command {
  const program = new Command();

  program
    .name("tpm")
    .description("Tonto Package Manager: A Package Manager to manage dependencies in your Tonto project")
    .version(packageVersion)
    .addHelpText("before", figlet.textSync("TPM"));

  program
    .command("install")
    .description("Install tonto dependencies")
    .option("-d, --dir [dirName]", "Directory of the actual project", ".")
    .action(installAction);

  // program.command("init").description("Initiate a Tonto project by creating a Manifest").action(installAction);

  program
    .command("add")
    .argument("[currentDir]", "Directory of the actual project", ".")
    .requiredOption("-n, --name <name>", "Name of the package to add")
    .requiredOption("-u, --url <projectURL>", "Tonto Project URL to install")
    .requiredOption("-v, --version <projectVersion>", "Tonto Project version")
    .option("-d, --dir [dirName]", "Directory of dependency in referenced Git Repository")
    .description("Add a dependency to your Tonto Project")
    .action(addDependencyAction);

  program
    .command("i")
    .description("Install tonto dependencies")
    .option("-d, --dir [dirName]", "Directory of the actual project", ".")
    .action(installAction);

  program
    .command("uninstall")
    .argument("<projectURL>", "Dependency name to uninstall")
    .description("Remove a dependency from your project");

  return program;
}

export default async function (argv: readonly string[] = process.argv): Promise<void> {
  await createTpmProgram().parseAsync([...argv]);
}

export * from "./actions/installAction.js";
export * from "./actions/addDependencyAction.js";
