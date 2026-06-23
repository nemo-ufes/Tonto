"use client"

import { List } from "lucide-react"
import { useEffect, useState } from "react"
import type { DocMeta } from "@/lib/docs"
import { cn } from "@/lib/utils"

export function TableOfContents({ headings }: { headings: DocMeta["headings"] }) {
  const [active, setActive] = useState(headings[0]?.id)

  useEffect(() => {
    const elements = headings.map((heading) => document.getElementById(heading.id)).filter(Boolean) as HTMLElement[]
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-90px 0px -70%", threshold: 0 },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [headings])

  if (!headings.length) return null

  return (
    <nav aria-label="On this page" className="sticky top-[112px] text-sm">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><List className="size-4" />On this page</h2>
      <div className="space-y-1 border-l border-border/70">
        {headings.map((heading) => (
          <a
            key={heading.id}
            href={`#${heading.id}`}
            className={cn(
              "-ml-px block border-l border-transparent py-1.5 pl-4 leading-5 text-muted-foreground transition-colors hover:text-foreground",
              heading.level === 3 && "pl-7",
              active === heading.id && "border-primary text-primary",
            )}
          >
            {heading.title}
          </a>
        ))}
      </div>
    </nav>
  )
}
