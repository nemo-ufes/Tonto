"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { DocIcon } from "@/components/icons"
import type { NavGroup } from "@/lib/docs"
import { cn, withBasePath } from "@/lib/utils"

export function Sidebar({ navigation, onNavigate }: { navigation: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" })
  }, [pathname])

  return (
    <nav aria-label="Documentation" className="h-full overflow-y-auto overscroll-contain px-5 py-8 lg:px-4">
      <div className="mx-auto w-full max-w-[280px] space-y-9 pb-12">
        {navigation.map((group) => (
          <section key={group.group}>
            <h2 className="mb-3 flex items-center gap-2.5 px-3 text-sm font-semibold text-foreground">
              <DocIcon name={group.icon} className="size-4" />
              {group.group}
            </h2>
            <div className="space-y-0.5">
              {group.pages.map((page) => {
                const href = page.slug === "index" ? "/" : `/${page.slug}/`
                const active = page.slug === "index" ? pathname === withBasePath("/") || pathname === "/" : pathname.endsWith(`/${page.slug}/`) || pathname.endsWith(`/${page.slug}`)
                return (
                  <Link
                    key={page.slug}
                    ref={active ? activeRef : undefined}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-10 items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm leading-5 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground",
                      active && "bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary",
                    )}
                  >
                    <DocIcon name={page.icon} className="mt-0.5 size-4 shrink-0 opacity-75" />
                    <span>{page.title}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </nav>
  )
}
