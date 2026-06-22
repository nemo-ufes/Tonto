import React from "react"
import { BadgeCheck, CircleAlert, FileCode2, Info, Lightbulb, PackagePlus, Repeat2 } from "lucide-react"
import { MermaidDiagram } from "@/components/mermaid-diagram"
import { cn, withBasePath } from "@/lib/utils"

function internalHref(href?: string) {
  return href ? withBasePath(href) : "#"
}

export const mdxComponents = {
  a: ({ href = "", ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    if (href.startsWith("/") || href.startsWith("#")) return <a href={internalHref(href)} {...props} />
    return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} {...props} />
  },
  img: ({ src = "", alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img src={internalHref(String(src))} alt={alt} loading="lazy" {...props} />
  ),
  pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
    if (React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>
      if (child.props.className?.includes("language-mermaid")) {
        return <MermaidDiagram chart={String(child.props.children).trim()} />
      }
    }
    return <pre {...props}>{children}</pre>
  },
  CardGroup: ({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) => (
    <div className={cn("not-prose my-8 grid gap-4", cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>{children}</div>
  ),
  Card: ({ title, icon, href, children }: { title: string; icon?: string; href: string; children: React.ReactNode }) => {
    const Icon = icon === "badge-check" ? BadgeCheck : icon === "repeat" ? Repeat2 : icon === "package-plus" ? PackagePlus : FileCode2
    return (
      <a href={internalHref(href)} className="group rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        <Icon className="mb-6 size-6 text-primary" />
        <h3 className="mb-1.5 text-base font-semibold text-card-foreground">{title}</h3>
        <div className="text-sm leading-6 text-muted-foreground">{children}</div>
      </a>
    )
  },
  Frame: ({ caption, children }: { caption?: string; children: React.ReactNode }) => (
    <figure className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm">
      <div className="overflow-hidden rounded-lg">{children}</div>
      {caption && <figcaption className="px-3 pb-1 pt-3 text-center text-xs text-muted-foreground">{caption}</figcaption>}
    </figure>
  ),
  Note: ({ children }: { children: React.ReactNode }) => <Callout icon={Info} tone="blue">{children}</Callout>,
  Tip: ({ children }: { children: React.ReactNode }) => <Callout icon={Lightbulb} tone="green">{children}</Callout>,
  Warning: ({ children }: { children: React.ReactNode }) => <Callout icon={CircleAlert} tone="amber">{children}</Callout>,
}

function Callout({ children, icon: Icon, tone }: { children: React.ReactNode; icon: typeof Info; tone: "blue" | "green" | "amber" }) {
  return (
    <aside className={cn("not-prose my-6 flex gap-3 rounded-xl border p-4 text-sm leading-6", tone === "blue" && "border-blue-500/20 bg-blue-500/8", tone === "green" && "border-emerald-500/20 bg-emerald-500/8", tone === "amber" && "border-amber-500/20 bg-amber-500/8")}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", tone === "blue" && "text-blue-500", tone === "green" && "text-emerald-500", tone === "amber" && "text-amber-500")} />
      <div>{children}</div>
    </aside>
  )
}
