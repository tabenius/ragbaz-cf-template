# Artifact exchange: gifts, voices, and useful things

An additive extension of the Cloudflare website template. The first use case is
**Maria's gift collection**. The same infrastructure supports a singleton, a
collection landing page, consented peer opinions on existing project pages, and
HTML/plain-text email exports in either direction.

The template core is being edited in another session. This extension composes
with its existing Worker, renderer, token authority and security helper. It
does not fork or overwrite that work. The example authority is application-owned,
outside the shared `src/` database-free core.

## Try the first gift collection

From the repository root:

```sh
node extensions/artifacts/build.mjs extensions/artifacts/examples/maria/config.json build/maria-gifts
npx wrangler dev --config build/maria-gifts/wrangler.json
```

Open the local URL printed by Wrangler:

- `/`: Maria's collection landing page, initially containing one completed name gift.
- `/maria-name/`: the full adapted name keepsake.
- `/api/artifacts/maria`: the explicit public collection JSON.
- `/share/`: the first-party inbound form. Receiving requires the authority bindings.
- `/inbox/`: private editor UI. Missing identity/storage refuses access, not a demo login.

This builds a local preview; `https://gifts.ragbaz.cc` is the configured future
canonical origin, not a claim of deployment. Generated outgoing HTML, text, and
the reusable submission envelope are in `build/maria-gifts/previews/`.
The HTML email is a template/export, not a sent message. Its canonical link becomes
usable once that site is actually hosted.

The illustrated Hearthlight design adapts the original standalone page in
`~/AGENTS/Devotional/Peers/Marija-Cvijovic/000-Interpersonal/Name/index.html`.
It keeps the uncertain etymology, distinctions between kinds of affection,
reception wording, and sources. It attributes no opinion or photograph to Maria.
Technical gifts can be added as they become completed artifacts.

## One model, several presentations

See [the contracts](CONTRACTS.md) and the machine-readable
[artifact](schemas/artifact.schema.json) and
[private submission](schemas/submission.schema.json) schemas.

```json
{
  "schema": "ragbaz.artifact/v1",
  "id": "a-thoughtful-tool",
  "kind": "software",
  "title": "A small useful tool",
  "ingress": "What this makes easier, and why it was shared.",
  "presentation": "card",
  "created_at": "2026-10-05T00:00:00Z",
  "image": { "src": "/assets/tool.webp", "alt": "An accessible thumbnail description" },
  "resources": [{
    "type": "oci",
    "identifier": "registry.example.org/tools/example",
    "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "media_type": "application/vnd.oci.image.manifest.v1+json",
    "bytes": 1024
  }]
}
```

`kind` answers **what this is for**. `presentation` answers **how it looks**.
Each resource describes **where/how to find it**, independently of MIME type and
byte size. An OCI descriptor is not an HTML frame; a Mouseion reference is not a
claim of cryptographic verification. No automatic remote OG scraping, downloading,
or execution happens when a card is rendered.

Cards support `card`, `thumbnail`, `quote`, `box`, and `og` presentations. Each
artifact also has its own canonical page with OG/Twitter metadata. An optional
raster `social_image` is distinct from an SVG illustration or thumbnail. The
Maria build generates a deterministic PNG social card.

The HTML contains an inert `application/json` projection; API clients can use the
same public fields. JSON text is escaped against closing-script injection. The
page remains readable without JavaScript. Email rendering uses escaped text,
table layout, inline styling and absolute links; it does not inherit website CSS.

## Singleton, collection, or cards on an existing page

The site configuration embeds ordinary `ragbaz.project-site/v1` under `site`.
Collections define a stable ID, path, title, ingress, mode, and theme:

```json
{
  "id": "peer-voices",
  "path": "/voices/",
  "title": "What our peers share",
  "ingress": "Shared opinions and useful contributions, with permission.",
  "mode": "collection",
  "theme": "paper"
}
```

- `mode: "singleton"` with exactly one artifact renders the full gift at the
  collection entry. Its individual permalink remains available.
- `mode: "collection"` renders enumerated artifact cards and links.
- `theme: "hearth"` gives a warm domestic-print edition; `paper` inherits fleet roles.
- Multiple collections use distinct, non-overlapping paths. A root collection
  owns that site's landing page; use nested collection paths when retaining a
  normal project homepage.

To place a collection's cards below an existing public core page, add:

```json
"placements": [{
  "path": "/guide/",
  "collection": "peer-voices",
  "title": "What our peers say about this work"
}]
```

The core page must exist and be public. The site's existing header, footer and
theme remain its authority; slot styles are scoped. A submission's collection
routes it to its landing page and to these configured page slots. Thus an approval
can update the relevant page and the common inbox without rebuilding content.
Paths in this first version identify default-language editions; translated slots
can be a later explicit extension.

## Inline data or live SQL

**Inline mode:** `source: "inline"`, with `inline` keyed by collection ID. Every
artifact requires an explicit `permissions[id]` record containing the scopes and
a reference. Those private references are consumed by the builder, not deployed.
An `approved-only` core site additionally requires exact `artifactApprovals`
SHA-256 digests of the normalized artifact JSON; no build grants approval.
Author-owned static inline data is not a dynamic inbox and is not retroactively
updated by SQL withdrawal. Use service mode for peer opinions needing that flow.

**Service mode:** set `source: "service"` and an explicit `exchangeService` Worker
name. The generated website binds `ARTIFACT_EXCHANGE`. The authority owns D1 and
returns only approved public descriptors. Pages, slots, and inventories use
`no-store`, so a SQL publication/withdrawal is reflected on the next request.
Private items and inline fallback data do not enter a service-mode build.

Public projections paginate at 200 items; the renderer follows up to 20 pages
(4,000 artifacts) and refuses an oversized collection rather than silently hiding
the rest. The private inbox paginates at 50. Split larger collections by topic.

## The SQL-backed publication action

1. Receive a peer's form submission or import a reviewed mailbox envelope. Both
   inbound and outbound submissions begin **pending**.
2. Review the exact quote, chosen public name, identity/profile links, and any
   portrait. Private correspondence metadata remains separate.
3. Record the person's explicit permission and its private evidence reference
   for the required scopes: artifact, quote, name, photo, profile as applicable.
4. Press **Publish on collection**. The editor-authorized endpoint executes:

```sql
UPDATE exchange_items
SET state = 'approved', published_at = ?, reviewed_by = ?
WHERE id = ? AND revision = ? AND state = 'pending';
```

The database trigger refuses that update without the matching permission record.
Editorial approval does not substitute for the person's permission. Permission
evidence is recorded by the operator; this is not an automated claim of verified
identity or a digital-signature verifier.

Submitted content is immutable. Changed text, attribution or a photograph creates
a new item and requires fresh permission/review. Withdrawal of a permission record
removes the public projection; private editor unpublication and the sender's
receipt-token withdrawal are also supported. An `artifact-editor` role protects
the private UI and API, including its HTML, not just its JavaScript requests.

## Authority integration

See [authority setup and API](authority/README.md). The central exchange can
receive submissions for several sites/collections in one D1 database. Its
namespaced tables may be hosted in an existing application-owned D1 after the
owning application's migration review; the extension does not choose or migrate
the current DetCordon/contact database automatically.

The identity adapter must expose the documented session shape and real editor
roles. No second account database is created. Mailbox receiving and actual email
delivery remain with the existing mail authority: import a correspondence
envelope through the authenticated `/import` API, and hand the HTML/text export
to its outgoing-message workflow. These are usable transport boundaries rather
than a replacement mail server or a claim that automatic mailbox ingestion exists.

The other session's shared `ragbaz_peers` / `ragbaz_interests` directory now has
a read-only bridge: an authorized `/import-interest` call retains the existing
private peer/interest IDs and exact received wording. It creates an artifact
review item, not a second contact or account. Existing contact/attribution consent
is deliberately not upgraded to permission to publish a peer opinion. The source
database must be explicitly bound as `EXCHANGE_PEERS_DB`.

## Verification

```sh
node --test extensions/artifacts/tests/*.test.mjs
node extensions/artifacts/build.mjs extensions/artifacts/examples/maria/config.json build/maria-gifts
npx wrangler deploy --dry-run --config build/maria-gifts/wrangler.json
npx wrangler deploy --dry-run --config extensions/artifacts/authority/wrangler.example.json
npm ci
npm run check
npm run bundle
```

The extension tests use real SQLite with a D1-compatible wrapper. They cover
publication triggers, field-scoped permission, contact isolation, withdrawal,
authentication, origin and body-size refusals, transport validation, HTML/JSON
escaping, singleton/collection rendering, page slots, mounts, email and build
boundaries. Preview, schema and deployment wiring details belong in the
extension's verification notes as those checks are run.
