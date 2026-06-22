"use client"

import Link from "next/link"
import { Menu, X } from "lucide-react"
import { useState } from "react"
import { SearchDialog } from "@/components/search-dialog"
import { Sidebar } from "@/components/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import type { DocMeta, NavGroup } from "@/lib/docs"
import { cn, withBasePath } from "@/lib/utils"

export function SiteHeader({ docs, navigation }: { docs: DocMeta[]; navigation: NavGroup[] }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 h-[72px] border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid h-full max-w-[1660px] grid-cols-[1fr_auto] items-center gap-5 px-5 lg:grid-cols-[300px_minmax(280px,500px)_1fr] lg:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
            <Link href="/" aria-label="Tonto documentation home" className="inline-flex">
              <img src={withBasePath("/images/tonto-logo.png")} alt="Tonto" className="h-8 w-auto" />
            </Link>
          </div>
          <div className="hidden lg:block">
            <SearchDialog docs={docs} />
          </div>
          <div className="flex items-center justify-end gap-1 xl:gap-5">
            <nav className="hidden items-center gap-5 xl:flex">
              <a className="nav-link" href="https://github.com/nemo-ufes/Tonto">GitHub</a>
              <a className="nav-link" href="https://www.npmjs.com/package/tonto-cli">CLI on npm</a>
              <a className="nav-link" href="https://marketplace.visualstudio.com/items?itemName=Lenke.tonto">VS Code Extension</a>
            </nav>
            <Button asChild className="hidden rounded-xl bg-primary px-5 sm:inline-flex">
              <Link href="/quickstart/">Quickstart <span aria-hidden>›</span></Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className={cn("fixed inset-0 z-50 lg:hidden", !mobileOpen && "pointer-events-none")} aria-hidden={!mobileOpen}>
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className={cn("absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
        />
        <aside className={cn("absolute inset-y-0 left-0 w-[min(88vw,340px)] border-r bg-background shadow-2xl transition-transform duration-300", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex h-[72px] items-center justify-between border-b px-5">
            <img src={withBasePath("/images/tonto-logo.png")} alt="Tonto" className="h-8 w-auto" />
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="size-5" /></Button>
          </div>
          <div className="h-[calc(100%-72px)]">
            <Sidebar navigation={navigation} onNavigate={() => setMobileOpen(false)} />
          </div>
        </aside>
      </div>
    </>
  )
}
