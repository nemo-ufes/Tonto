"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useTheme } from "next-themes"

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, "")
  const { resolvedTheme } = useTheme()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        })
        const { svg } = await mermaid.render(`mermaid-${id}`, chart)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void render()
    return () => { cancelled = true }
  }, [chart, id, resolvedTheme])

  if (failed) return <pre><code>{chart}</code></pre>
  return <div ref={ref} className="mermaid-diagram" aria-label="Diagram" />
}
