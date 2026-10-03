# Optional fleet modules

The template ships executable service-boundary adapters rather than new copies
of the fleet's account, editorial, lead or commerce databases. Ordinary project
websites do not enable them. Applications keep their own permissions, state and
UI; consumers select/configure the authority they actually use.

## Service adapters

```json
{
  "integrations": {
    "identity": {
      "binding": "AUTH", "origin": "https://ragbaz.cc",
      "credentials": "forward", "callerOrigin": true
    },
    "provenance": {
      "binding": "MUSEUM", "origin": "https://mouseion.ragbaz.cc",
      "credentials": "omit"
    }
  },
  "serviceBindings": { "AUTH": "ragbaz-cc", "MUSEUM": "mouseion" }
}
```

Binding names/Worker names are operator-selected. No service is created by a
module. Missing bindings return 503. Never configure an authority solely because
a similarly named Worker exists: its contract and access policy must match.

| Family | Front prefix | Existing authority contract |
|---|---|---|
| identity | `/api/auth` | main-site session, email-link and passkey APIs |
| editorial | `/api/editorial` | Elias.Venn draft autosave/checkpoints, publish/proposals and import preview/commit APIs |
| newsletter | `/api/newsletter` | main-site subscribe/unsubscribe APIs |
| push | `/api/push` | Thinktank push subscribe/unsubscribe APIs |
| commerce | `/api/commerce` | provisioner prices/create-checkout APIs |
| provenance | `/api/provenance` | Mouseion public scroll, evidence, attestation and chain views |
| catalog | `/api/catalog` | main-site GraphQL queries, with mutations refused |

The exact method/path allowlist is `src/integrations.js`. Only those paths are
forwarded to the named service binding. Request bodies are streamed with a
64 KiB default ceiling; `maxBytes` may set an explicit ceiling up to 2 MiB.
Mutations need a declared site Origin. Credential forwarding must be chosen
explicitly; request IPs, arbitrary headers and internal secrets are not forwarded.
Upstream errors stay errors. Redirects are not followed; only a local identity
redirect with its session cookies is preserved. Responses do not widen CORS.

Origin is never rewritten to make an unauthorized request look authorized.
The receiving service must explicitly accept the consumer origin. The shared
RAGBAZ identity handler can use `callerOrigin: true` to calculate its relying
party/session policy from a declared front origin; an unknown preview origin is
refused. A pseudonymous authority with a fixed relying-party origin should keep
login and authoring on that authority's own UI. The proxy is not cross-domain
passkey federation and does not supply an identity provider's confirmation UI.

Likewise, the editorial adapter does not create an editor or replace immutable
revision/role checks. Notification delivery, retention, VAPID rotation and
checkout/payment verification remain with their real providers. Product-specific
UI/adoption work stays distinct from the template adapter's completion.

## Portable models

`src/domains.js` projects explicitly permitted fields for:

- public products and lifecycle/capabilities;
- AI provenance, keeping configured and served model names separate;
- integrity, signature, signer trust and external-observation states;
- monetary offers using safe integer minor units and ISO-style currency codes.

These helpers validate/project data; they do not cryptographically verify a
signature, approve governance or provision a paid account. Provenance reads keep
the source authority's versioned envelope rather than inventing verification.

## Education

Enable `modules.education` and provide `lessons: ["page-id", ...]` in sequence.
Every lesson must name a non-draft registered page. The template adds previous/
next links and local mark-read controls. It stores only recognized lesson IDs
under a versioned site-scoped key, handles disabled local storage, and labels
completion as self-recorded reading rather than assessment evidence.

Reader mode also provides fullscreen and printing. Interactive calculators and
server-synchronized assessment remain the owning school's domain features.

## Social cards

`socialCard: true` generates a deterministic 1200×630 PNG at build time.
An explicitly supplied `socialImage` takes precedence. Layout is in
`design/card.json`; palette roles come from the vendored fleet tokens. A small
original bitmap alphabet avoids remote fonts/native rendering dependencies.
The generated PNG is in the exact-byte asset inventory and OG/Twitter metadata.
There is no card-generating runtime or R2 dependency in a project website.

## Release provenance

The build records template version, source commit and dirty-state in the site
API's `release` object. A copied snapshot does not claim the enclosing consumer's
Git commit as an upstream template revision. Live deployment checks require the
exact clean release and re-hash every published asset against its manifest.
