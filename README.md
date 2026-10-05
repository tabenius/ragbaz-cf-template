# ragbaz-cf-template

Shared, maintained source for RAGBAZ project websites on Cloudflare Workers.
The first consumers are **WeftMark, Nostoi, Sylvae and Rebekah**. Each builds to
its own Worker; all four import the same renderer and HTTP invariants.

Version 0.2.0: approachable studio websites, editorial design and shared interest capture.
Source home: [tabenius/ragbaz-cf-template](https://github.com/tabenius/ragbaz-cf-template).
Product runtimes retain their own maturity and authorities; this website release
does not declare those products production-ready.

## Use

```sh
npm ci
npm run check
npm run bundle                     # four Wrangler dry-run bundles
npm run smoke                      # real local workerd HTTP/asset checks
npm run smoke:browser              # Chromium interaction/mobile checks
npm run smoke:live                 # exact deployed commit and asset hashes
npm run smoke:peers                # live form/data checks; synthetic records only
npm run dev -- weftmark             # local workerd preview
npm run deploy -- weftmark          # workers.dev preview deployment
npm run deploy -- weftmark --production
```

Production uses the custom domain from the selected site's explicit HTTPS
origin, e.g. `weftmark.ragbaz.cc`. The live smoke command verifies actual
deployment identity rather than inferring it from configuration. Deploy requires an authenticated
Wrangler session or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
deployment environment. This website-only baseline needs no D1, R2, KV, model
keys or application secrets.

`npm run build -- nostoi` builds one site. Generated configurations and assets
are in `build/<slug>/`; production routes are absent from preview config.
The root and publication pages are server-rendered; `/index.html` redirects to
the root; `/robots.txt`, `/sitemap.xml`, `/healthz`, `/manifest.json`,
`/api/v1/site`, `/api/v1/publications` and static assets have explicit handlers.
Unknown URLs return a real 404. The health endpoint describes only the website.

## Fleet capabilities

`ragbaz.project-site/v1` adds a page/publication registry, publication lifecycle
dates, locale editions, alias redirects, nested path mounts and optional reader,
catalog and contact modules. Existing v0 configurations remain accepted.

All four project sites feature the actual multilingual “The Loom and the Grove”
article, substantial project explanations, use cases, an interoperable workflow,
quickstarts, project marks and a clear RAGBAZ studio identity. Reader preferences
use local storage and first-party scripts; normal reading works without scripts.

- [v1 configuration and extension API](docs/configuration.md)
- [Feature priorities and module ownership](docs/fleet-roadmap.md)
- [Optional fleet adapters and portable models](docs/modules.md)

The shared header helper supports exact external provider origins for specialized
adapters. Authenticated API adapters retain cookies and use private/no-store;
their own identity authority must authenticate requests. The core does not
implement account login or grant authorization through a response profile.

Contact forms are enabled on all four sites. They reuse the existing DetCordon
marketing D1 database through separate, additive peer/interest tables. Repeated
normalized emails share an internal contact UUID; each request keeps its own
date, project, domain, page and name claim. Optional attribution and account
matching are explicitly consented and qualified. Browser privacy signals win.
See [shared peers and attribution](docs/peers-attribution.md) for schema,
retention, migration, Cloudflare settings and account-match limitations.

## Ownership

| Surface | Owner |
|---|---|
| `src/`, `assets/`, reusable `scripts/` | template invariants |
| `sites/<slug>/site.json` | project content, status, links, canonical origin |
| `design/provenance.json` | exact vendored web-token bytes and source revision |
| `build/` | disposable build output |
| future product APIs, database schemas, review/auth state | product repository |

Source content is plain text with validated links, not arbitrary HTML.
The default layout uses the fleet's warm paper, serif typography and restrained
ink roles. Fonts come from installed system families; nothing loads from a
third-party CDN. The existing sites have several palettes; this baseline uses
the web authority named by the workspace rather than inventing another one.

## Create a standalone site

```sh
npm run scaffold -- nostoi /path/to/new-nostoi-site
# In that new directory:
git init -b main
npm install
npm run bundle
frog repo discover --root . --no-scan
```

The scaffold refuses an existing target. It creates editable `site.json`, build
commands, and a hash-inventoried **snapshot** of the shared core under `vendor/`.
The snapshot works before the template's first commit. It is deliberately labeled
as a working-tree snapshot; it does not pretend that a released upstream exists.
For ongoing inheritance, convert it to a **commit-pinned Git submodule** after
publication. See [inheritance](docs/inheritance.md).

## Study and next steps

- [Sources and decisions](docs/source-study.md)
- [Website invariants and extension boundaries](docs/invariants.md)
- [Git, GitHub, Frog and release workflow](docs/inheritance.md)
- [DetCordon adoption recommendation](docs/detcordon-adoption.md)
- [Task intent and acceptance criteria](docs/tasks.md)

Authenticated API gateways and native edge services remain explicit later
phases. They need product-specific contracts; a project homepage does not
port a Python runtime, Rust audit verifier or Nix-built OCI image to the edge.
