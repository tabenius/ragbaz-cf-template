# Fleet feature priorities

P0: prerequisite when adopting a dependent site. P1: broadly useful next.
P2: optional application module. P3: specialized/later. Model means data/domain
model, including explicitly labeled AI provenance. Source features are not
claims about live deployments or about template implementation.

| Feature | UX | API | Model | Template status / owner |
|---|---|---|---|---|
| Multiple pages and stable routes | P0 | P0 | P0 | implemented page registry and redirects |
| Canonical/alias/base-path identity | P0 | P0 | P0 | implemented; explicit path zones |
| Capability-specific response policy | P0 | P0 | P0 | implemented helper and API adapter boundary |
| Publication lifecycle/dates | P1 | P1 | P0 | implemented; product maturity remains separate |
| Localization and honest fallback | P1 | P1 | P0 | implemented; RTL direction supported |
| Approved public-source boundary | P1 | P0 | P0 | implemented page/custom-asset pins; retain product publishers |
| Publication cards/list/sort | P1 | P2 | P1 | implemented; static cards plus first-party enhancement |
| Reader themes/font/print | P1 | P3 | P1 | implemented local preferences, A4/A5 print |
| Long-document navigation | P1 | P3 | P1 | section TOC, lesson sequence and fullscreen implemented |
| Whole-book editions | P1 | P2 | P1 | handbook owns edition build; optional integration |
| Social images/project marks | P1 | P2 | P1 | static-cover precedence and deterministic raster cards implemented |
| Designed/untrusted document embedding | P2 | P0 | P0 | cf-provenance-module; distinct trust classes/origins required |
| Publication inventory/federation | P1 | P1 | P1 | implemented site/edition/asset inventory; federation optional |
| Contact/pilot forms | P1 | P1 | P1 | implemented optional fixed-service adapter; product service owns retention |
| Newsletter/browser push | P2 | P2 | P1 | authority adapters implemented; delivery/VAPID/consent state remain with providers |
| Identity/passkeys/email link | P2 | P0 | P0 | authority adapter implemented; relying-party/confirmation UI remain authority-owned |
| Editorial ownership/collections | P2 | P1 | P0 | authority adapter implemented; role and collection models remain editorial-owned |
| Authoring/imports/revisions | P2 | P2 | P1 | exact draft/import API adapter implemented; existing authoring UI owns revisions |
| First-party media ownership | P1 | P1 | P0 | static assets implemented; authenticated media in editorial/provenance modules |
| Provenance/attestations/AI model identity | P1 | P1 | P0 | provenance views and portable models implemented; verification stays with Nostoi/Mouseion |
| Encrypted correspondence | P3 | P2 | P0 | specialized Mouseion adapter, not default contact |
| Educational progress/widgets | P2 | P3 | P1 | local reading progress/sequence implemented; specialized calculators remain school-owned |
| Pricing/checkout | P2 | P1 | P0 | offer contract and authority adapter implemented; payment/provisioning state remain provider-owned |
| Fleet catalog/observations | P1 | P1 | P0 | public product projections and read-only catalog adapter implemented |
| Traffic/read-count summaries | P2 | P2 | P1 | optional telemetry policy; never treated as exact readership |

## Models that must remain separate

- Site, product, publication and edition.
- Account, public byline, roles and collection membership.
- Mutable working copy/metadata and immutable content/revision.
- Claimed evidence, integrity verification, signer trust and external observation.
- Publication/update/generation/observation timestamps.
- Access policy, indexability, consent and retention.

The source study covers `www.ragbaz`, Thinktank/DocBin, school/library,
Elias.Venn/survivors.se, Mouseion, Ephor (formerly KAGP) and DetCordon.
Reusable implementations should be extracted behind contracts rather than
copying mature application schemas into every homepage.
