# Tonto Documentation

Self-hosted documentation for Tonto, built with Next.js, Tailwind CSS, and shadcn/ui patterns. The existing MDX files and `docs.json` remain the source of truth for content and navigation.

## Local development

From the repository root:

```bash
npm run docs:dev
```

Create and preview the production export:

```bash
npm run build --workspace=tonto-documentation
npm run preview --workspace=tonto-documentation
```

The generated static site is written to `packages/tonto-documentation/out`.

## GitHub Pages

The `documentation.yml` workflow builds and deploys the site when documentation changes land on `main`. It configures `NEXT_PUBLIC_BASE_PATH=/Tonto` for the repository Pages URL.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

If the repository name changes, update `NEXT_PUBLIC_BASE_PATH` in `.github/workflows/documentation.yml`.
