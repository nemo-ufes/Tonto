import Link from "next/link"
import { notFound } from "next/navigation"
import { compileMDX } from "next-mdx-remote/rsc"
import { ChevronLeft, ChevronRight, Github, Linkedin, Pencil } from "lucide-react"
import rehypeSlug from "rehype-slug"
import remarkGfm from "remark-gfm"
import { mdxComponents } from "@/components/mdx-components"
import { Sidebar } from "@/components/sidebar"
import { SiteHeader } from "@/components/site-header"
import { TableOfContents } from "@/components/table-of-contents"
import { getAdjacentDocs, getAllDocs, getDocMeta, getDocSource, getNavigation } from "@/lib/docs"

export function getDocumentationMetadata(slug: string) {
  try {
    const doc = getDocMeta(slug)
    return { title: doc.title, description: doc.description }
  } catch {
    return {}
  }
}

export async function DocumentationPage({ slug }: { slug: string }) {
  let source: string
  try {
    source = getDocSource(slug)
  } catch {
    notFound()
  }

  const doc = getDocMeta(slug)
  const docs = getAllDocs()
  const navigation = getNavigation()
  const adjacent = getAdjacentDocs(slug)
  const { content } = await compileMDX({
    source,
    components: mdxComponents,
    options: {
      parseFrontmatter: true,
      mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] },
    },
  })

  return (
    <>
      <SiteHeader docs={docs} navigation={navigation} />
      <div className="mx-auto grid min-h-screen max-w-[1660px] grid-cols-1 px-5 pt-[72px] lg:grid-cols-[300px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[300px_minmax(0,850px)_220px] xl:gap-x-12 2xl:gap-x-16">
        <aside className="sticky top-[72px] hidden h-[calc(100vh-72px)] border-r border-border/70 lg:block">
          <Sidebar navigation={navigation} />
        </aside>

        <main className="min-w-0 py-12 lg:px-10 lg:py-14 xl:px-0">
          <div className="mb-10">
            <div className="mb-3 text-sm text-muted-foreground">{navigation.find((group) => group.pages.some((page) => page.slug === slug))?.group}</div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{doc.title}</h1>
            <p className="mt-3 max-w-[760px] text-xl leading-8 text-muted-foreground">{doc.description}</p>
          </div>

          <article className="prose">{content}</article>

          <div className="mt-14 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
            {adjacent.previous ? (
              <Link href={adjacent.previous.slug === "index" ? "/" : `/${adjacent.previous.slug}/`} className="pagination-link">
                <ChevronLeft className="size-4" /><span><small>Previous</small>{adjacent.previous.title}</span>
              </Link>
            ) : <span />}
            {adjacent.next && (
              <Link href={`/${adjacent.next.slug}/`} className="pagination-link text-right sm:ml-auto">
                <span><small>Next</small>{adjacent.next.title}</span><ChevronRight className="size-4" />
              </Link>
            )}
          </div>

          <footer className="mt-12 border-t border-border py-8 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <a href={`https://github.com/nemo-ufes/Tonto/edit/main/packages/tonto-documentation/${slug === "index" ? "index" : slug}.mdx`} className="inline-flex items-center gap-2 hover:text-foreground"><Pencil className="size-4" />Edit this page</a>
              <div className="flex items-center gap-4">
                <a href="https://github.com/nemo-ufes/Tonto" aria-label="GitHub" className="hover:text-foreground"><Github className="size-4" /></a>
                <a href="https://www.linkedin.com/in/matheus-lenke-coutinho-492a4b15a/" aria-label="LinkedIn" className="hover:text-foreground"><Linkedin className="size-4" /></a>
              </div>
            </div>
          </footer>
        </main>

        <aside className="hidden py-14 xl:block">
          <TableOfContents headings={doc.headings} />
        </aside>
      </div>
    </>
  )
}
