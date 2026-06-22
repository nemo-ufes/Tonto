"use client"

import { useEffect, useMemo, useState } from "react"
import { Command } from "cmdk"
import { CornerDownLeft, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { type DocMeta } from "@/lib/docs"
import { withBasePath } from "@/lib/utils"

export function SearchDialog({ docs }: { docs: DocMeta[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const results = useMemo(() => {
    const normalized = query.toLowerCase().trim()
    if (!normalized) return docs.slice(0, 8)
    return docs
      .filter((doc) => `${doc.title} ${doc.description} ${doc.headings.map((heading) => heading.title).join(" ")}`.toLowerCase().includes(normalized))
      .slice(0, 10)
  }, [docs, query])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="group flex h-11 w-full items-center gap-3 rounded-xl border border-border/80 bg-background px-4 text-sm text-muted-foreground shadow-sm transition-colors hover:border-foreground/20 md:max-w-[500px]">
          <Search className="size-[18px]" />
          <span>Search...</span>
          <kbd className="ml-auto hidden text-xs font-medium text-muted-foreground/80 sm:inline">⌘K</kbd>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="sr-only">Search documentation</DialogTitle>
        <DialogDescription className="sr-only">Search all Tonto documentation pages.</DialogDescription>
        <Command shouldFilter={false} className="overflow-hidden rounded-lg bg-popover">
          <div className="flex items-center gap-3 border-b px-3 pr-9">
            <Search className="size-5 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search documentation..."
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="p-8 text-center text-sm text-muted-foreground">No documentation found.</Command.Empty>
            {results.map((doc) => (
              <Command.Item
                key={doc.slug}
                value={doc.slug}
                onSelect={() => {
                  window.location.href = withBasePath(doc.slug === "index" ? "/" : `/${doc.slug}/`)
                  setOpen(false)
                }}
                className="group flex cursor-pointer items-center rounded-lg px-3 py-3 outline-none data-[selected=true]:bg-accent"
              >
                <div>
                  <div className="text-sm font-medium">{doc.title}</div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{doc.description}</div>
                </div>
                <CornerDownLeft className="ml-auto size-4 opacity-0 group-data-[selected=true]:opacity-60" />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
