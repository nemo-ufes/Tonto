import { cp, mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(root, "public")

await rm(publicDir, { recursive: true, force: true })
await mkdir(publicDir, { recursive: true })

for (const directory of ["images", "gifs", "files"]) {
  await cp(join(root, directory), join(publicDir, directory), { recursive: true })
}

await writeFile(join(publicDir, ".nojekyll"), "")
