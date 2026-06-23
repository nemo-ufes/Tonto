import fs from "node:fs"
import path from "node:path"
import config from "@/docs.json"

const docsRoot = process.cwd()

export type DocMeta = {
  slug: string
  title: string
  description: string
  icon?: string
  headings: { title: string; id: string; level: number }[]
}

export type NavGroup = {
  group: string
  icon: string
  pages: DocMeta[]
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function readFrontmatter(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  const values: Record<string, string> = {}
  if (match) {
    for (const line of match[1].split("\n")) {
      const separator = line.indexOf(":")
      if (separator < 0) continue
      values[line.slice(0, separator).trim()] = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "")
    }
  }
  return values
}

export function getDocSource(slug: string) {
  const filename = slug === "index" ? "index.mdx" : `${slug}.mdx`
  return fs.readFileSync(path.join(docsRoot, filename), "utf8")
}

export function getDocMeta(slug: string): DocMeta {
  const source = getDocSource(slug)
  const frontmatter = readFrontmatter(source)
  const headings = [...source.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((match) => ({
    level: match[1].length,
    title: match[2].replace(/[`*_~]/g, ""),
    id: slugify(match[2]),
  }))

  return {
    slug,
    title: frontmatter.title ?? slug,
    description: frontmatter.description ?? "",
    icon: frontmatter.icon,
    headings,
  }
}

const pageSlugs = config.navigation.groups.flatMap((group) => group.pages)

export function getAllDocs() {
  return pageSlugs.map(getDocMeta)
}

export function getNavigation(): NavGroup[] {
  return config.navigation.groups.map((group) => ({
    ...group,
    pages: group.pages.map(getDocMeta),
  }))
}

export function getAdjacentDocs(slug: string) {
  const docs = getAllDocs()
  const index = docs.findIndex((doc) => doc.slug === slug)
  return {
    previous: index > 0 ? docs[index - 1] : null,
    next: index < docs.length - 1 ? docs[index + 1] : null,
  }
}
