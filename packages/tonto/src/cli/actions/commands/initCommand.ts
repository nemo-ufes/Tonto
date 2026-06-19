import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { createDefaultTontoManifest, manifestFileName, TontoManifest, toJson } from '../../model/grammar/TontoManifest.js';
import { agentFolderGuidanceFiles } from '../../templates/agent-guidance.js';
import { copilotInstructions } from '../../templates/copilot-instructions.js';
import { cursorHeader, vscodeHeader } from '../../templates/headers.js';
import { readmeTemplate } from '../../templates/readme.js';
import { llmGuidance } from '../../templates/rules/llm-guidance.js';
import { tontoCardinalityGuidance } from '../../templates/rules/tonto-cardinality-guidance.js';
import { tontoGuidance } from '../../templates/rules/tonto-guidance.js';
import { tontoLLMCreateNewElements } from '../../templates/rules/tonto-llm-create-new-elements.js';
import { tontoLLMDocumentationGuide } from '../../templates/rules/tonto-llm-documentation-guide.js';
import { tontoLLMTerminologyAnalysisGuide } from '../../templates/rules/tonto-llm-terminology-analysis-guide.js';
import { tontoLLMUnderstanding } from '../../templates/rules/tonto-llm-understanding.js';
import { catsTontoFile } from '../../templates/tonto/cats.js';
import { datatypesTontoFile } from '../../templates/tonto/datatypes.js';
import { dogsTontoFile } from '../../templates/tonto/dogs.js';
import { mainTontoBlankFile } from '../../templates/tonto/main.blank.js';
import { mainTontoFile } from '../../templates/tonto/main.js';
import { vetvisitsTontoFile } from '../../templates/tonto/vetvisits.js';

interface InitOptions {
    catDogExample?: boolean;
    template?: string;
}

export type InitProjectFile = { type: 'file' | 'dir'; relativePath: string; content?: string };

export interface InitManifestAnswers {
    projectName: string;
    displayName?: string;
    version?: string;
    description?: string;
    license?: string;
    authorName?: string;
    authorEmail?: string;
}

export const GUIDANCE_TARGET_OPTIONS = [
    {
        label: 'Cursor',
        value: 'cursor',
        description: 'Generate guidance under .cursor/rules with .mdc files'
    },
    {
        label: 'VS Code',
        value: 'vscode',
        description: 'Generate guidance under .github/instructions for Copilot and VS Code'
    },
    {
        label: 'Codex',
        value: 'codex',
        description: 'Generate guidance under .codex with markdown files'
    },
    {
        label: 'Claude Code',
        value: 'claude',
        description: 'Generate guidance under .claude with markdown files'
    },
    {
        label: 'Google (Gemini / Antigravity)',
        value: 'google',
        description: 'Generate guidance under .agents with markdown files for Gemini-based tools such as Antigravity'
    },
    {
        label: 'All',
        value: 'all',
        description: 'Generate guidance for every supported editor and agentic IDE'
    }
] as const;

export type GuidanceTargetChoice = (typeof GUIDANCE_TARGET_OPTIONS)[number]['value'];

type GuidanceTemplateEntry = InitProjectFile & {
    target: Exclude<GuidanceTargetChoice, 'all'>;
};

const CURSOR_RULES_DIR = path.join('.cursor', 'rules');
const VSCODE_INSTRUCTIONS_DIR = path.join('.github', 'instructions');
const CODEX_GUIDANCE_DIR = '.codex';
const CLAUDE_GUIDANCE_DIR = '.claude';
const GOOGLE_GUIDANCE_DIR = '.agents';

function buildAgentFolderTemplateEntries(
    folderPath: string,
    target: Exclude<GuidanceTargetChoice, 'all'>
): GuidanceTemplateEntry[] {
    return [
        { type: 'dir', relativePath: folderPath, target },
        ...agentFolderGuidanceFiles.map(({ fileName, content }) => ({
            type: 'file' as const,
            relativePath: path.join(folderPath, fileName),
            content,
            target
        }))
    ];
}

const GUIDANCE_TEMPLATE_ENTRIES: readonly GuidanceTemplateEntry[] = [
    { type: 'dir', relativePath: CURSOR_RULES_DIR, target: 'cursor' },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto-guidance.mdc'),
        content: `${cursorHeader}${tontoGuidance}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto_llm_guidance.mdc'),
        content: `${cursorHeader}${llmGuidance}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto-cardinality-guidance.mdc'),
        content: `${cursorHeader}${tontoCardinalityGuidance}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto-llm-create-new-elements.mdc'),
        content: `${cursorHeader}${tontoLLMCreateNewElements}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto_llm_terminology_analysis_guide.mdc'),
        content: `${cursorHeader}${tontoLLMTerminologyAnalysisGuide}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto_llm_understanding_and_summarization_guide.mdc'),
        content: `${cursorHeader}${tontoLLMUnderstanding}`,
        target: 'cursor'
    },
    {
        type: 'file',
        relativePath: path.join(CURSOR_RULES_DIR, 'tonto_llm_documentation_guide.mdc'),
        content: `${cursorHeader}${tontoLLMDocumentationGuide}`,
        target: 'cursor'
    },
    { type: 'dir', relativePath: VSCODE_INSTRUCTIONS_DIR, target: 'vscode' },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto-guidance.instructions.md'),
        content: `${vscodeHeader}${tontoGuidance}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto-cardinality-guidance.instructions.md'),
        content: `${vscodeHeader}${tontoCardinalityGuidance}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto_llm_guidance.instructions.md'),
        content: `${vscodeHeader}${llmGuidance}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto-llm-create-new-elements.instructions.md'),
        content: `${vscodeHeader}${tontoLLMCreateNewElements}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto_llm_terminology_analysis_guide.instructions.md'),
        content: `${vscodeHeader}${tontoLLMTerminologyAnalysisGuide}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto_llm_understanding_and_summarization_guide.instructions.md'),
        content: `${vscodeHeader}${tontoLLMUnderstanding}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join(VSCODE_INSTRUCTIONS_DIR, 'tonto_llm_documentation_guide.instructions.md'),
        content: `${vscodeHeader}${tontoLLMDocumentationGuide}`,
        target: 'vscode'
    },
    {
        type: 'file',
        relativePath: path.join('.github', 'copilot-instructions.md'),
        content: copilotInstructions,
        target: 'vscode'
    },
    ...buildAgentFolderTemplateEntries(CODEX_GUIDANCE_DIR, 'codex'),
    ...buildAgentFolderTemplateEntries(CLAUDE_GUIDANCE_DIR, 'claude'),
    ...buildAgentFolderTemplateEntries(GOOGLE_GUIDANCE_DIR, 'google')
] as const;

// Validation function for project name
function validateProjectName(inputValue: string): boolean | string {
    if (!/^[\w-]+$/.test(inputValue)) {
        return 'Project name can only contain letters, numbers, underscores, and hyphens.';
    }
    if (fs.existsSync(path.resolve(inputValue))) {
        return `A directory named '${inputValue}' already exists in the current directory.`;
    }
    return true;
}

export function buildGuidanceProjectFiles(projectName: string): InitProjectFile[] {
    return GUIDANCE_TEMPLATE_ENTRIES.map(({ target: _target, ...entry }) => ({
        ...entry,
        relativePath: joinProjectRelativePath(projectName, entry.relativePath)
    }));
}

export function shouldIncludeTemplatePathForGuidanceTarget(
    guidanceTarget: GuidanceTargetChoice,
    relativePath: string
): boolean {
    if (guidanceTarget === 'all') {
        return true;
    }

    if (isCursorGuidancePath(relativePath)) {
        return guidanceTarget === 'cursor';
    }

    if (isVscodeGuidancePath(relativePath)) {
        return guidanceTarget === 'vscode';
    }

    if (isCodexGuidancePath(relativePath)) {
        return guidanceTarget === 'codex';
    }

    if (isClaudeGuidancePath(relativePath)) {
        return guidanceTarget === 'claude';
    }

    if (isGoogleGuidancePath(relativePath)) {
        return guidanceTarget === 'google';
    }

    return true;
}

function joinProjectRelativePath(projectName: string, relativePath: string): string {
    return projectName ? path.join(projectName, relativePath) : relativePath;
}

function isCursorGuidancePath(relativePath: string): boolean {
    return pathContainsDirectory(relativePath, '.cursor');
}

function isVscodeGuidancePath(relativePath: string): boolean {
    return pathContainsDirectory(relativePath, '.github');
}

function isCodexGuidancePath(relativePath: string): boolean {
    return pathContainsDirectory(relativePath, CODEX_GUIDANCE_DIR);
}

function isClaudeGuidancePath(relativePath: string): boolean {
    return pathContainsDirectory(relativePath, CLAUDE_GUIDANCE_DIR);
}

function isGoogleGuidancePath(relativePath: string): boolean {
    return pathContainsDirectory(relativePath, GOOGLE_GUIDANCE_DIR);
}

function pathContainsDirectory(relativePath: string, directoryName: string): boolean {
    const normalizedPath = normalizeRelativePath(relativePath);
    return (
        normalizedPath === directoryName ||
        normalizedPath.startsWith(`${directoryName}/`) ||
        normalizedPath.includes(`/${directoryName}/`) ||
        normalizedPath.endsWith(`/${directoryName}`)
    );
}

function normalizeRelativePath(relativePath: string): string {
    return relativePath.split(path.sep).join('/');
}

function normalizeOptionalText(value: string | undefined): string | undefined {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : undefined;
}

export function buildInitManifest(answers: InitManifestAnswers): TontoManifest {
    const manifest = createDefaultTontoManifest();
    manifest.projectName = answers.projectName;
    manifest.displayName = normalizeOptionalText(answers.displayName) ?? answers.projectName;
    manifest.version = normalizeOptionalText(answers.version) ?? manifest.version;
    manifest.license = normalizeOptionalText(answers.license) ?? manifest.license;
    manifest.authors = [];

    const description = normalizeOptionalText(answers.description);
    if (description) {
        manifest.description = description;
    }

    const authorName = normalizeOptionalText(answers.authorName);
    if (authorName) {
        const authorEmail = normalizeOptionalText(answers.authorEmail);
        manifest.authors = [
            {
                name: authorName,
                ...(authorEmail ? { email: authorEmail } : {}),
            },
        ];
    }

    return manifest;
}

async function initAction(options: InitOptions) {
    console.log(chalk.cyan('[Tonto: Init new project command]'));
    console.log(chalk.blue('initAction started'));
    console.log(chalk.blue(`options: ${JSON.stringify(options)}`));
    // Gather project information through individual prompts
    const name = await input({
        message: 'Project name:',
        default: 'tonto-project',
        validate: validateProjectName
    });

    const version = await input({
        message: 'Version:',
        default: '0.0.1'
    });

    const description = await input({
        message: 'Description (optional):'
    });

    const author = await input({
        message: 'Author name (optional):'
    });

    const guidanceTarget = await select({
        message: 'Which editor or agentic IDE do you use?',
        choices: GUIDANCE_TARGET_OPTIONS.map(({ label, value, description }) => ({
            name: label,
            value,
            description
        }))
    });

    // Ask for template selection
    const template = await select({
        message: 'Choose a project template:',
        choices: [
            {
                name: 'Blank',
                value: 'blank',
                description: 'Start with an empty project'
            },
            {
                name: 'Cat and Dog example',
                value: 'cat-dog',
                description: 'Start with a Cat and Dog example project'
            }
        ]
    });

    const answers = { name, version, description, author, template };
    console.log(chalk.blue(`Collected answers: ${JSON.stringify(answers)}`));

    const projectPath = path.resolve(answers.name);
    console.log(chalk.blue(`Creating project directory at ${projectPath}`));
    try {
        fs.mkdirSync(projectPath, { recursive: true });
        console.log(chalk.blue(`Created project directory ${projectPath}`));
    } catch (err) {
        console.error(chalk.red(`Failed to create project directory ${projectPath}: ${String(err)}`));
        throw err;
    }

    const tontoJsonPath = path.join(projectPath, manifestFileName);
    console.log(chalk.blue(`Checking for tonto.json at ${tontoJsonPath}`));
    if (fs.existsSync(tontoJsonPath)) {
        console.log(chalk.yellow('tonto.json already exists. Skipping creation.'));
    } else {
        // Create manifest from canonical API and populate with collected answers
        const manifest = buildInitManifest({
            projectName: answers.name,
            displayName: answers.name,
            version: answers.version,
            description: answers.description,
            authorName: answers.author,
        });
        console.log(chalk.blue('Writing tonto.json'));
        try {
            fs.writeFileSync(tontoJsonPath, toJson(manifest));
            console.log(chalk.green(`tonto.json created successfully at ${tontoJsonPath}`));
        } catch (err) {
            console.error(chalk.red(`Failed to write tonto.json at ${tontoJsonPath}: ${String(err)}`));
            throw err;
        }
    }

    materializeSelectedGuidanceFiles(projectPath, guidanceTarget);

    const srcPath = path.join(projectPath, 'src');
    if (fs.existsSync(srcPath)) {
        console.log(chalk.yellow('src directory already exists. Skipping creation.'));
    } else {
        fs.mkdirSync(srcPath, { recursive: true });

        // Use template selection or fallback to command line option
        const selectedTemplate = answers.template || (options.catDogExample ? 'cat-dog' : 'blank');

        if (selectedTemplate === 'cat-dog') {
            copyTemplate(mainTontoFile, srcPath, 'main.tonto');
            copyTemplate(catsTontoFile, srcPath, 'Cats.tonto');
            copyTemplate(vetvisitsTontoFile, srcPath, 'Vetvisits.tonto');
            copyTemplate(dogsTontoFile, srcPath, 'Dogs.tonto');
            copyTemplate(datatypesTontoFile, srcPath, 'Datatypes.tonto');
            console.log(chalk.green('Cat and Dog example files created successfully.'));
        } else {
            copyTemplate(mainTontoBlankFile, srcPath, 'main.tonto');
            console.log(chalk.green('Blank template created successfully.'));
        }
        console.log(chalk.green('src directory created successfully.'));
    }

    const readmePath = path.join(projectPath, 'README.md');
    if (fs.existsSync(readmePath)) {
        console.log(chalk.yellow('README.md already exists. Skipping creation.'));
    } else {
        copyTemplate(readmeTemplate, projectPath, 'README.md');
        console.log(chalk.green('README.md created successfully.'));
    }

    // Create ignore files
    const cursorIgnorePath = path.join(projectPath, '.cursorignore');
    if (fs.existsSync(cursorIgnorePath)) {
        console.log(chalk.yellow('.cursorignore already exists. Skipping creation.'));
    } else {
        fs.writeFileSync(cursorIgnorePath, '.github\n.tonto_modules\n', 'utf-8');
        console.log(chalk.green('.cursorignore created successfully.'));
    }

    const gitIgnorePath = path.join(projectPath, '.gitignore');
    if (fs.existsSync(gitIgnorePath)) {
        console.log(chalk.yellow('.gitignore already exists. Skipping creation.'));
    } else {
        fs.writeFileSync(gitIgnorePath, 'tonto_modules\n', 'utf-8');
        console.log(chalk.green('.gitignore created successfully.'));
    }

    const vscodeIgnorePath = path.join(projectPath, '.vscodeignore');
    if (fs.existsSync(vscodeIgnorePath)) {
        console.log(chalk.yellow('.vscodeignore already exists. Skipping creation.'));
    } else {
        fs.writeFileSync(vscodeIgnorePath, '.cursor\n', 'utf-8');
        console.log(chalk.green('.vscodeignore created successfully.'));
    }
}

function materializeSelectedGuidanceFiles(projectPath: string, guidanceTarget: GuidanceTargetChoice): void {
    const guidanceFiles = buildGuidanceProjectFiles('').filter((file) =>
        shouldIncludeTemplatePathForGuidanceTarget(guidanceTarget, file.relativePath)
    );
    const createdDirectoryPaths = new Set<string>();

    console.log(chalk.blue(`Creating guidance files for target '${guidanceTarget}'`));

    for (const directoryEntry of guidanceFiles.filter((file): file is InitProjectFile & { type: 'dir' } => file.type === 'dir')) {
        ensureDirectorySync(path.join(projectPath, directoryEntry.relativePath), createdDirectoryPaths);
    }

    for (const fileEntry of guidanceFiles.filter((file): file is InitProjectFile & { type: 'file' } => file.type === 'file')) {
        const targetPath = path.join(projectPath, fileEntry.relativePath);
        ensureDirectorySync(path.dirname(targetPath), createdDirectoryPaths);
        fs.writeFileSync(targetPath, fileEntry.content ?? '', 'utf-8');
        console.log(chalk.green(`Created ${fileEntry.relativePath}`));
    }
}

function ensureDirectorySync(directoryPath: string, createdDirectoryPaths: Set<string>): void {
    if (createdDirectoryPaths.has(directoryPath)) {
        return;
    }

    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }

    createdDirectoryPaths.add(directoryPath);
}

function copyTemplate(templateContent: string, destinationDir: string, destinationName: string) {
    fs.writeFileSync(path.join(destinationDir, destinationName), templateContent, 'utf-8');
}

export function initCommand(): Command {
    const init = new Command('init');
    init.description('Init a new Tonto project with interactive template selection')
        .option('--cat-dog-example', 'Initialize a project with a Cat and Dog example (legacy option).')
        .action(initAction);
    return init;
}

// Build list of files and directories to create for an init project without performing IO
export function buildInitProjectFiles(projectName: string, options: InitOptions): InitProjectFile[] {
    const files: InitProjectFile[] = [];

    // project dir
    files.push({ type: 'dir', relativePath: projectName });

    // tonto.json - use canonical manifest
    const manifest = buildInitManifest({ projectName, displayName: projectName });
    files.push({ type: 'file', relativePath: path.join(projectName, manifestFileName), content: toJson(manifest) });

    // src
    files.push({ type: 'dir', relativePath: path.join(projectName, 'src') });
    const selectedTemplate = options?.template || (options?.catDogExample ? 'cat-dog' : 'blank');
    if (selectedTemplate === 'cat-dog') {
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'main.tonto'), content: mainTontoFile });
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'Cats.tonto'), content: catsTontoFile });
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'Vetvisits.tonto'), content: vetvisitsTontoFile });
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'Dogs.tonto'), content: dogsTontoFile });
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'Datatypes.tonto'), content: datatypesTontoFile });
    } else {
        files.push({ type: 'file', relativePath: path.join(projectName, 'src', 'main.tonto'), content: mainTontoBlankFile });
    }

    // README
    files.push({ type: 'file', relativePath: path.join(projectName, 'README.md'), content: readmeTemplate });

    files.push(...buildGuidanceProjectFiles(projectName));

    // ignore files
    files.push({ type: 'file', relativePath: path.join(projectName, '.cursorignore'), content: '.github\n.tonto_modules\n' });
    files.push({ type: 'file', relativePath: path.join(projectName, '.gitignore'), content: 'tonto_modules\n' });
    files.push({ type: 'file', relativePath: path.join(projectName, '.vscodeignore'), content: '.cursor\n' });

    return files;
}
