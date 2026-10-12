import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const languageRoot = path.join(packageRoot, "src/language");
const generator = fileURLToPath(new URL("../bin/langium.js", import.meta.resolve("langium-cli")));
const config = path.join(packageRoot, "langium-config.json");
let previousFingerprint;
let pending = false;
let running = false;

async function fingerprint() {
  const files = (await readdir(languageRoot, { recursive: true }))
    .filter((file) => file.endsWith(".langium"))
    .map((file) => path.join(languageRoot, file));
  files.push(config);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

async function regenerate() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    const currentFingerprint = await fingerprint();
    if (currentFingerprint !== previousFingerprint) {
      previousFingerprint = currentFingerprint;
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [generator, "generate"], { cwd: packageRoot, stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code !== 0) console.error("Grammar generation failed. Waiting for source changes.");
          resolve();
        });
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      await regenerate();
    }
  }
}

// Poll content rather than filesystem events: generated files and metadata-only
// notifications must not trigger regeneration, and this consumes no watch handles.
setInterval(regenerate, 1000);
await regenerate();
console.log("Watching Tonto grammar content for changes.");
