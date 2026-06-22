import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { withBasePath } from "@/lib/utils"

export const metadata: Metadata = {
  title: { default: "Tonto Documentation", template: "%s · Tonto" },
  description: "Documentation for Tonto, a textual language and toolchain for UFO-based OntoUML ontology projects.",
  icons: { icon: withBasePath("/images/favicon.ico") },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
