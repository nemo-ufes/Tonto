import type { Metadata } from "next"
import { DocumentationPage, getDocumentationMetadata } from "@/components/documentation-page"

export const metadata: Metadata = getDocumentationMetadata("index")

export default function Page() {
  return <DocumentationPage slug="index" />
}
