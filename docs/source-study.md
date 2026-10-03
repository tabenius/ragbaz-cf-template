# Source study and decisions

Studied 2026-10-03. Revisions identify source snapshots, not live deployment
attestations. Private project implementation has not been copied into this repo.

| Project | Source revision | Relevant surfaces |
|---|---|---|
| `tabenius/www.ragbaz` | `20084b9409c0ef3af2f31b55e36634566c9498fd` | `README.md`, `wrangler.jsonc`, `worker.mjs`, `site/colors_and_type.css`, `site/school/` |
| DocBin / Thinktank | `18fc5f2e5f757478a36477a11a42d79a56fc3d6e` | `docs/base-path.md`, `src/lib/site.ts`, root/mirror Wrangler configs |
| handbook / school | `39de539f96895475a705768afb1b55c637910e14` | `AGENTS.md`, canonical build layout, `001-opencode-draft/design/tokens.css` |
| library | `ca2f1cebb301aa49b4f49ce841084ade559e9023` | `README.md`, `package.json`, generated `public/assets/tokens.css` |
| `tabenius/Elias.Venn` | `2babab5127ba62cc66507c39a2b15c4507b7915b` | `README.md`, `wrangler.toml`, canonical/alias origin contract |
| Mouseion | `1ca0bfe092f2988357b3c0d62f068920683d45b4` | `AGENTS.md`, `wrangler.jsonc`, `src/http.js`, `src/design.js` |
| Ephor (`BAZ.AI-Governance`) | `f5b63b75837d1fa639e8fb35c24dc6e05091d77e` | `marketing/worker.js`, `marketing/wrangler.jsonc` |
| `tabenius/BAZ.detcordon` | `883603ef844e34dcdae886baaddff6ca438da3d6` | `AGENTS.md`, `marketing/README.md`, `marketing/src/worker.ts`, `marketing/wrangler.jsonc`, `marketing/public/` |

## What each contributes

**Main RAGBAZ site.** Product links, educational routes and stable public URLs
are fleet-level concerns. It uses Next/OpenNext around mostly plain HTML; a
new landing page does not need that framework just to serve HTML. Its school
security/cellular access check runs before route handling. Preserve that
ordering in future protected adapters. Legacy Konsonans URLs redirect to Ephor.

**Thinktank.** Locale routes and a second Worker under `/thinktank` need
build-time routing discipline. Canonical origin and base path are separate.
The mirror builds in isolation because shared output paths otherwise collide.
This template uses separate per-site output directories and deliberately
starts with root-mounted sites.

**School and library.** Keep editorial sources separate from deployment assets.
Generated publication inventories describe exact bytes and source revisions.
The web tokens named by the workspace live in library's generated assets;
the current canonical build source is in the handbook. The template vendors
the published bytes with a digest so the generated nature is not hidden.

**Elias.Venn / survivors.se.** Server-rendered reading pages can be fast and
framework-free. Public identity and authentication identity are distinct;
aliases do not define canonical URLs or passkey relying-party identity.
survivors.se is an alias; bereaved.dad is the configured primary in this snapshot.

**Mouseion.** Headers apply centrally. Public pages and untrusted scrolls have
different origin/CSP boundaries. Offline signing keys never belong in Workers.
Versioned observation envelopes are useful, but a homepage should not fabricate
an audit or verification result. Its Ptolemaic visual motifs are project-owned.

**Ephor, formerly KAGP (Konsonans AI Governance Platform).** The mature marketing
surface includes integration explanations, roadmap labeling, contact delivery,
and rate limiting. It also duplicates inline CSS palettes. Learn from its
content structure and contact controls; centralize new invariants rather than
copying another inline palette. `BAZ.AI-Governance` is private; website content
and public information need an explicit publication boundary.

**DetCordon.** Already has a Worker, static public assets, a real 404 contract,
security headers, protected pilot requests and a cleanup schedule. Public
diligence is extracted only from approved marked blocks and SHA-256 pins. The
template must complement those boundaries. An adoption must preserve published
paths (`/diligence/`, `/prospectus/`, `/teaser/`) and `POST /api/pilot`.

## Result

Use a small dependency-free shared core, a locked Worker build toolchain,
project-owned plain-text content, vendored authoritative tokens, real HTTP
errors, and explicit deployment configs. Extract larger features only after
two real consumers demonstrate the same contract. The template is a maintained
source dependency, not a generator whose output is silently forked forever.
