# Fleet website contract: v1

## Shared behavior

1. **Explicit identity and routes.** Canonical origin, aliases, base path and
   locales come from configuration. Alias requests redirect to the canonical
   origin; unknown hosts may render a preview but never influence canonical
   metadata. Path-zone deployment needs an explicit zone for every origin.
2. **Distinct states.** Product maturity is not publication lifecycle. Document
   status is draft/published/revised/archived; initial publication and revision
   dates are separate. Drafts have no public route, index or deployed content.
3. **Honest translations.** Only real editions get alternate-language links.
   A requested locale without an edition shows a labeled original-language
   fallback with the original canonical URL and language direction.
4. **First-party reading.** Normal pages work without JavaScript. Reader and
   catalog controls are progressive enhancements served locally; no remote
   fonts or default analytics. Preferences do not require an account.
5. **One design authority.** Vendored web tokens carry an exact digest and source
   revision. Website layout/theme extensions live in `site-tokens.css` with
   source-role comments. Renderer CSS does not declare literal colors or sizes.
6. **Text is data.** Escape text and attributes. Configured links allow HTTPS
   or mailto without credentials. Pages are structured text sections, not
   arbitrary HTML, Markdown, executable imports or an untrusted artifact host.
7. **HTTP outcomes stay distinct.** Public documents use GET/HEAD; configured
   API adapters dispatch before the public method gate. Unknown paths are 404,
   unsupported methods 405, unavailable infrastructure 503. No arbitrary proxy.
8. **Policy follows responsibility.** Common headers apply to every response.
   Public responses lose cookies; authenticated API adapters preserve cookies
   and force private/no-store. Exact HTTPS provider origins can extend script,
   connection and frame sources through the shared helper. No wildcard CSP.
9. **Observations are versioned.** API/manifest views carry schema, source and
   UTC observed_at. Website health never certifies runtime health or evidence.
10. **Builds fail on stale approval.** Approved-only mode requires a digest for
    the home and every public document, and exact digests for every custom
    asset. Unknown approvals, changed content and private-shaped text fail.
    This is not a replacement for a product's reviewed source-block publisher.
11. **Assets are explicit.** Copy only configured module assets and a project's
    `public/assets/` allowlisted media types. No symlinks, private config files,
    custom executable HTML/JS or overrides of template assets. The served
    asset inventory hashes exact bytes, not estimated build identities.
12. **Source is preserved.** Build output cannot contain a source directory.
    Clear only generated static assets. Preview configs have no production
    routes; production path patterns cannot accidentally own sibling prefixes.

## Extension boundaries

`createSiteWorker(config, { adapters })` accepts code-owned API adapters with
non-overlapping prefixes and a public/authenticated response policy. The adapter
must authenticate/authorize its own requests; a response policy grants nothing.
The core reserves its site/publication projections and contact endpoint.

Optional contact validates same-origin requests, bounded JSON, consent and
fields, then applies a service-backed rate limit keyed by HMAC rather than raw
IP. It sends minimal data to one fixed service binding, never a user-selected
URL. Its receiving service owns delivery/retention; no lead database is created
by enabling the UI. A missing binding/secret refuses the request.

Identity, editorial roles, notifications, commerce, educational state and
cryptographic provenance have distinct integration contracts and portable
models (see `modules.md`). Their authorities and application UIs remain in
the owning products. Untrusted artifacts require a separately isolated origin and policy;
the ordinary publication renderer must never gain arbitrary script execution.

For DetCordon adoption, preserve pilot API controls, approved source-block
digests, static URL inventory, cleanup schedule and existing Worker identity.
Sharing a helper does not authorize replacing those contracts.
