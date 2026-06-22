import type { Metadata } from "next"
import { DocumentationPage, getDocumentationMetadata } from "@/components/documentation-page"
import { getAllDocs } from "@/lib/docs"

type PageProps = { params: Promise<{ slug: string[] }> }

export const dynamicParams = false

export function generateStaticParams() {
  return getAllDocs()
    .filter((doc) => doc.slug !== "index")
    .map((doc) => ({ slug: doc.slug.split("/") }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return getDocumentationMetadata((await params).slug.join("/"))
}

export default async function Page({ params }: PageProps) {
  return <DocumentationPage slug={(await params).slug.join("/")} />
}
