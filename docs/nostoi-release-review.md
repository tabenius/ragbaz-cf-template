# Nostoi editorial revision and release priorities

## Scope and source review

The project page now uses the **Witness Register** visual edition: archival
paper, marine ink, brass references, subtle coordinate ruling and an original
diagram separating sequence integrity, signing-key trust and external observation.
Its optional local featured-publication panel is reusable template functionality.

The home page adds implementation detail, custody limits, measured performance,
dependence and public oversight. Four published-source briefs cover verification,
independent destinations, canonical bytes, and tail risk/observability. Published
source status means a page is included in the build; it does not claim a live
deployment has already been updated.

Primary implementation sources:

- Nostoi `README.md`: formats, basic CLI exit codes and the project's name/mark.
- `docs/ANCHOR-FANOUT.md`: agreement, unavailable destinations, credential scopes
  and provider-specific retention. In particular, one usable destination can
  suffice with an explicit warning; this is not a majority-vote quorum.
- `docs/ATTESTATIONS.md`: signatures, coverage, pinned keys and claimed time.
- `docs/INTEROPERABILITY.md`: current bindings include attestation-document checks
  but report cryptographic signatures as unchecked.
- `docs/LARGE-CHAIN-BENCHMARKS.md`: qualified native experiments and per-trial
  quantiles, not a deployment-wide performance or tail-risk guarantee.

SQLite triggers constrain writes while the schema remains intact; they do not
prevent the database owner from dropping triggers or replacing the file. Actor
labels are producer attribution, not authenticated identity. These boundaries
are explicit in the revised content.

## Verification

The release check set is:

```sh
npm ci
npm run check
npm run bundle
npm run smoke
npm run smoke:browser
npm run smoke:browser -- nostoi
```

Nostoi's browser check exercises the home and four briefs at 1440, 768, 390 and
320 pixels, the configured feature image, the catalog, menu keyboard control,
reader preferences, night mode and print ornament removal. Desktop/night/mobile
screenshots are generated under `build/nostoi/` for visual review.

The displayed shell examples were syntax-checked and executed with the local
release CLI in an isolated temporary directory: the intact two-record history
verified with exit 0 and its modified copy failed with exit 1. The linked internal
briefs and implementation-document paths were checked. That verifies the example;
it is not a new certification of Nostoi's complete runtime.

## Priority order for deploying the project websites

| Priority | Aspect | Required next evidence/action |
| --- | --- | --- |
| P0 | Production release credentials | GitHub repository secret listing was empty at review. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, or use the authorised local deployment environment. |
| P0 | Contact storage readiness | All four sites enable contact. Inspect the actual existing D1 schema and migration state before enabling the new forms; a source migration file does not prove it was applied. Use the owner-reviewed additive migration and backup workflow. |
| P0 | Shared abuse-control secret | Confirm `PEER_HASH_KEY` is configured for each receiving site and that the chosen D1 bindings are correct. Missing configuration correctly produces 503, which should not be mistaken for a working form. |
| P0 | Shared maintenance owner | Nostoi's existing cron runs expiration and opt-in account reconciliation. The attempted additional WeftMark timer hit the account's free-plan limit; it was removed from the configuration rather than upgrading the plan or deleting unrelated timers. |
| P0 | Live identity of a release | Deploy each selected site explicitly and run `smoke:live` against its release revision and asset hashes. Run the controlled peer submission/cleanup check before claiming contact works in production. |
| P1 | CI coverage of optional extensions | The release workflow now invokes artifact tests, independent schema validation and browser checks. Watch the exact pushed revision; the separate private common-identity package still needs its own consumer/integration evidence. |
| P1 | Gift exchange integration | Provision its explicitly chosen DB and real editor-session adapter; connect service bindings and public intake limits. Inline previews are ready, but the example authority configuration is not a live service. |
| P1 | Shared identity completion | `ragbaz-common` is a private repository with passing tests, but consumers still need adoption and complete ceremony, session, role and email-delivery integration checks. Do not interpret primitive tests as end-to-end authentication evidence. |
| P2 | A reviewed live Nostoi demonstration | Add a deliberately public sample chain, retained checkpoint and reproducible verification report. Protect private logs and make the sample's provenance explicit. |
| P2 | Audience-specific material | A sourced investigation/procurement brief and actual translations can follow. Keep technical mechanisms distinct from legal admissibility or claims of compliance. |

The four public project websites can be released independently of the future
full-duplex messaging system. Their production contact path still needs the
storage and secret checks above. A pushed commit and successful CI are release
evidence, not evidence that the live sites have changed.
