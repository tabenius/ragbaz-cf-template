# v1 configuration and extension interfaces

The four `sites/*/site.json` files are working examples. Version 0 is accepted
and normalized to the same model with empty optional features.

## Pages and editions

```json
{
  "schema": "ragbaz.project-site/v1",
  "modules": { "reader": true, "publications": true, "contact": false },
  "defaultLocale": "en",
  "locales": [
    { "code": "en", "label": "English", "dir": "ltr" },
    { "code": "sv", "label": "Svenska", "dir": "ltr" }
  ],
  "pages": [{
    "id": "guide", "path": "/guide/", "kind": "article",
    "title": "Guide", "description": "A short guide.",
    "status": "published", "created": "2026-10-03",
    "published": "2026-10-03", "updated": "2026-10-03",
    "tags": ["guide"],
    "sections": [{ "id": "start", "title": "Start", "paragraphs": ["Read this first."] }],
    "translations": {
      "sv": { "title": "Guide", "description": "En kort guide.",
        "sections": [{ "id": "start", "title": "Börja här", "paragraphs": ["Läs detta först."] }] }
    }
  }]
}
```

This is an extension fragment; retain the required site name, slug, origin,
description, tagline, product status, date, links and homepage sections.

Default-language pages use `/guide/`; other locales use `/sv/guide/`. The home
uses `/` and `/sv/`. Homepage translations live in the site's `translations`.
`/en/` redirects to the default-language root. Unknown locale routes are 404.
Missing editions show a visible fallback, without inventing a translation.

`kind: page` appears in primary navigation. `kind: article` appears in the
publication catalog. Drafts appear in neither and are excluded from generated
Worker source. Archives remain addressable with noindex, but leave the catalog
and sitemap. Publication order uses the initial `published` date.

## Origins and mounts

```json
{
  "origin": "https://project.ragbaz.cc",
  "aliases": ["https://old-project.ragbaz.cc"],
  "basePath": "/docs/project",
  "routeZones": {
    "https://project.ragbaz.cc": "ragbaz.cc",
    "https://old-project.ragbaz.cc": "ragbaz.cc"
  },
  "redirects": { "/old-guide": "/guide/" }
}
```

No mount means `basePath: ""` and custom-domain routes. A mount generates an
exact mount route plus `mount/*`, with explicitly supplied zone names. Zones
are never inferred from a hostname's last two labels. Aliases redirect with
path/query preserved; redirects cannot target arbitrary or draft pages.

Page, asset, language, metadata, form and sitemap links carry the mount once.
The Worker strips that prefix when asking its flat ASSETS binding for a file.

## Static social images and inventories

### A local featured publication

An optional `featuredPublication` selects an existing published/revised article
for the home and publication-index lead panel. Sites without it retain the
shared illustrated field guide. This is structured configuration, not custom HTML:

```json
"featuredPublication": {
  "id": "verification",
  "label": "The witness problem / Brief 01",
  "linkLabel": "Read the verification brief",
  "image": "/assets/witness-map.svg",
  "imageAlt": "Three separate questions about an audit record."
}
```

The article must exist and be public. Images are optional, first-party assets;
an image requires alternative text and the build checks that its file exists.
Locale links use the actual article edition, with the normal fallback behavior.

Put a cover in the site's `public/assets/cover.webp` and configure
`socialImage: "/assets/cover.webp"`. The build requires the file and emits
canonical first-party OG/Twitter image metadata. Alternatively, set
`socialCard: true` for a deterministic build-time raster card. A supplied cover
takes precedence. This is not a runtime dependency.

`/manifest.json` lists published documents, available edition URLs and exact
asset SHA-256/byte inventories. `/api/v1/site` describes public capabilities;
`/api/v1/publications` projects document metadata without bodies or private
configuration. All views carry schema/source/observed_at.

## Explicit publication approvals

Set `publicationPolicy: "approved-only"` and add `approvals` keyed by home/page
ID. Print candidate digests without modifying approvals:

```sh
node scripts/approval-digests.mjs sites/weftmark/site.json
```

Review content before recording the candidate digests. Custom assets require
`assetApprovals` keyed by unmounted `/assets/<file>` and the SHA-256 of the file.
Template assets already have shared source ownership; they are inventoried by
the build. Every custom asset must be explicitly approved, even if no page links
to it. Changed or extra approvals fail instead of auto-approving new bytes.

The private-shaped-text check is a baseline refusal check, not a comprehensive
secret detector. Keep a private product's exact source allowlist and publisher.

## Illustrative case explorer

An opt-in `modules.demonstration: true` enables a `ragbaz.demonstration/v1`
configuration containing label, title, description, disclaimer and up to eight
cases. Each case has a unique slug ID, title, description, conclusion and up to
twelve plain-text label/value fields. All text is escaped. The first-party
`demonstration.js` only switches visibility; it performs no requests, command
execution, policy calculation or authorization. All cases remain readable without
JavaScript, and print output includes them all. Keep simulated cases explicitly
labelled; they are not projections of a real application's state.

## Contact adapter

For a site using the shared `PEERS_DB`, `peerMaintenance: true` explicitly
enables daily production expiration at 03:17 UTC when the database binding is
configured. Preview builds have no database or cron. Nostoi is the shared
maintenance owner. Its additional `peerAccountReconciliation: true` explicitly
binds the existing account database for opt-in candidate matching. Other sites,
including WeftMark, use the shared contact database without their own cron or
account binding. This fits the existing free-plan cron limit. Expiration acts on
the namespaced peer tables, not legacy `leads`.

Contact accepts exact JSON or URL-encoded media types, bounded UTF-8 bodies and
object envelopes. Repeated form fields are refused rather than resolving consent
and contact data from different values. Idempotent retries must match both content
and source project/domain. Per-bucket limits stop increasing at their ceiling and
429 responses report the remaining window in `Retry-After`.

Enable `modules.contact` to serve `/contact/` and `POST /api/contact`.
The endpoint accepts JSON `{ email, message, consent: true }`, up to 8 KiB.
It requires Origin to match the canonical origin or an explicitly listed alias.

Configure in the project's deployment adapter/config:

- `CONTACT_SERVICE`: service binding receiving `POST /messages` with
  `ragbaz.contact-submission/v0`, source, generated ID, email, message and consent.
- `CONTACT_RATE_LIMITER`: Workers rate-limit binding exposing `limit({key})`.
- `CONTACT_HASH_KEY`: secret supplied with Wrangler, never committed.

The receiving service owns storage, retention and email delivery. It must define
that policy before deployment. The Worker does not forward raw IP, user agent
or contact secrets. No binding/secret means 503; rate limits mean 429; acceptance
means 202, not proof that email arrived. The four studio sites enable the direct
shared-D1 path described in `peers-attribution.md`; the service-binding path
remains available to other consumers. Missing infrastructure refuses a request.

Generated generic configs intentionally do not invent binding names/resources.
Consumer-owned deployment tooling can extend them with those explicit bindings.

## Authenticated API extension

```js
import { createSiteWorker } from './vendor/ragbaz-cf-template/src/worker.js';
export default createSiteWorker(site, {
  adapters: [{
    prefix: '/api/auth', policy: 'authenticated',
    fetch: (request, env, ctx) => identityAuthority.handle(request, env, ctx)
  }]
});
```

The selected identity authority performs authentication and permission checks.
The core dispatches the adapter before public GET/HEAD handling, preserves
cookies and forces private/no-store. Unknown/overlapping prefixes are refused;
exceptions produce a generic 503. The generic site build has no adapters; a
consumer wrapper owns its identity module and deployment bindings.

For a specialized router such as DetCordon, import `withSecurityHeaders` from
`src/http.js` directly and provide exact `scriptOrigins`, `connectOrigins` or
`frameOrigins` for Turnstile. The helper rejects wildcard/path/injected origins.
Keep its existing request handling, schemas and cleanup handler intact.
