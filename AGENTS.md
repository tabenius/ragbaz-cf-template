# RAGBAZ Cloudflare website template

Start with the user's `~/AGENTS.md` and linked MOTD, then the workspace
`AGENTS.md`. Fix Frog tooling problems first. Read this file, `README.md`,
`docs/invariants.md`, and the relevant Frog task before editing.

Frog owns scheduling and locks. Register the checkout with
`frog repo discover --root . --no-scan`; inspect tasks and active locks, then
claim the exact slice. Resolve identity with `frog repo key`, not a new hash.
Preserve unrelated work; never mark verified code as published or reviewed.

`src/`, `assets/`, and `scripts/` are shared invariants. `sites/<slug>/site.json`
is project-owned content. Generated `build/` is disposable. Downstream sites
must not edit their pinned template vendor directory. Update it in a reviewed
PR. Keep product-specific APIs, data schemas and secrets outside the core.
Read `docs/configuration.md` for v1 routes/editions and adapter boundaries, and
`docs/fleet-roadmap.md` for UX/API/model priorities. Never apply public-page
cookie removal to an authenticated adapter. Drafts cannot enter public routes
or generated Worker content. Approved-only sites need reviewed page and custom
asset digest pins; never auto-update approvals in a build.

Web token authority is `library/public/assets/tokens.css` (currently generated
from the handbook); terminal `design-system/` maps those roles. Vendored web
tokens carry a SHA-256/source revision in `design/provenance.json`. Update with
`node scripts/vendor-tokens.mjs /path/to/library`, never hand-edit the copy.
New website layout tokens belong in `assets/site-tokens.css`. No literal
colour, size or duration in `assets/site.css`.

Required checks: `npm ci`, `npm run check`, `npm run bundle`. New HTTP behavior
needs refusal tests. For deploy, specify a site explicitly and review its
domain configuration. Keep credentials in the deployment environment. Do not
copy private source into public pages; use explicit, reviewed public content.
