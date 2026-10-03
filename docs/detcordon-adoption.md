# DetCordon: recommended adoption

## Keep the existing source directory first

The production source is already `tabenius/BAZ.detcordon/marketing/`, not a
missing standalone website. The reviewed source snapshot is recorded in
`source-study.md`. Keep that directory and its existing Worker identity
`detcordon-marketing` while extracting genuinely shared behavior.

Recommended layout:

```text
BAZ.detcordon/
  marketing/
    vendor/ragbaz-cf-template/     # reviewed Git submodule pin
    src/worker.ts                 # product router, pilot API, scheduled cleanup
    public/                      # existing pages and project artwork
    diligence/publications.json  # existing exact approval/digest manifest
    scripts/                     # existing allowlisted publisher/config renderer
    migrations/                  # existing lead-data schema
    tests/                       # product-specific contract checks
```

The v1 factory is **not a drop-in replacement** for DetCordon's router: its
generic contact adapter does not replace pilot-data schemas, Turnstile checks
or scheduled cleanup. Multi-page routing and shared configurable headers now
exist, but preserve the current static pages and publisher during adoption.
`src/http.js` is the first narrow extraction seam: its exact-origin CSP
extensions can express Turnstile's script/frame/connect allowances. Prove
parity with tests in both repos before replacing the existing helper. Preserve
`detcordon-marketing` naming rather than adopting the new-sites default name.

## Migration slices

1. **Baseline contract evidence.** Inventory every public URL, canonical link,
   redirect, static asset, `POST /api/pilot`, robots/sitemap, scheduled retention
   cleanup and generated production setting. Capture current acceptance tests
   and a Wrangler dry-run. Create the downstream Frog task and file locks.
2. **Pin the template dependency.** After its first reviewed release, add the
   submodule under `marketing/vendor/`. Keep existing content and deployment
   scripts. Do not pull the template's other project homepages into the site.
3. **Adopt shared tokens/layout.** Map existing visual roles to shared tokens;
   keep DetCordon's project artwork and content. Review contrast, small-screen
   navigation, focus and reduced-motion behavior. Do not silently recolor the
   published site just to make it uniform.
4. **Adopt compatible HTTP helpers.** Share invariant header construction while
   preserving the Turnstile script/frame/connect allowlists, pilot handler,
   request size limits, atomic rate limits, HMAC IP privacy and 90-day retention.
5. **Prove publication parity.** Existing approved blocks, hashes, staged-index
   checks and public-copy refusal rules remain authoritative. Re-run
   `diligence:check`, formatting, typecheck, tests and Worker dry-run. Compare
   the public URL/metadata inventory and test POST refusal/acceptance paths.
6. **Deploy and observe.** Use the existing generated production config and
   runtime secret injection. Review a preview, switch the same production
   Worker deliberately, smoke-test published URLs and retain the prior deployment.

## If a separate public site repository is needed

Proposed name: `tabenius/detcordon-site`. Choose this only for a real contribution
or confidentiality boundary, since the product repository is private.

Private-product CI can generate approved public artifacts and a SHA-256
inventory, then open a PR containing only those artifacts in the public site
repo. The public CI verifies the inventory, template pin, link contract and
build; it does not fetch the private repository. The exact allowlisted source
and approved-block controls remain in the private producer. Publish no source
filenames, internal findings, local paths, private GitHub links or credentials
in public provenance. Retain the existing public-copy refusal rules.

For lead handling, either keep the current Worker and same-origin API routing,
or move the existing API/migrations intact into the site repo after a deliberate
data/secret ownership decision. Two Workers cannot ambiguously own the same
custom domain. A split needs explicit zone-route precedence or a service-binding
adapter with tests; the static template must never silently shadow `/api/pilot`.

## GitHub and Frog ownership

Create upstream/downstream tasks before edits. The template owns shared
behavior, DetCordon owns containment claims, approved copy, pilot data and
deployment. Record the dependency and exact upstream pin. An upstream release
opens a downstream update PR; it does not deploy automatically. A private-to-
public publication PR records its approved digest inventory, not raw source.

No DetCordon runtime or published deployment has been changed by this proposal.
