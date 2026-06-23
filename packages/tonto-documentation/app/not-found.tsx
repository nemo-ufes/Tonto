import Link from "next/link"

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div><p className="text-sm font-semibold text-primary">404</p><h1 className="mt-3 text-4xl font-bold">Page not found</h1><p className="mt-3 text-muted-foreground">The documentation page you requested does not exist.</p><Link className="mt-7 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/">Back to documentation</Link></div>
    </main>
  )
}
