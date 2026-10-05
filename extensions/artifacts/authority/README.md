# Example SQL authority

This application, rather than the core template, owns the private inbox and
editorial publication state. `worker.js` exposes the reusable authority factory;
`example-worker.js` is a concrete Maria collection adapter.

## Bindings and configuration

| Binding | Contract |
| --- | --- |
| `EXCHANGE_DB` | D1 database migrated with `0001-exchange.sql` |
| `EXCHANGE_IDENTITY` | Fixed service binding to the existing identity authority through a contract adapter |
| `EXCHANGE_PEERS_DB` | Optional read-only integration with the existing `ragbaz_peers`/`ragbaz_interests` directory |
| `EXCHANGE_RATE_LIMITER` | Workers rate limiter exposing `limit({key})`, required for public submit/revoke |
| `EXCHANGE_HASH_KEY` | Secret HMAC key for rate-limit identifiers; never store raw IPs |
| `PUBLIC_INTAKE` | Example adapter flag, false until explicitly enabled |

The example Wrangler file has a zero database ID, a placeholder identity adapter,
and public intake disabled. It can be bundled or used for local SQL validation;
it is not a deploy-ready live configuration. Set the actual database and service
names in a consumer-owned configuration. If reusing an existing D1, obtain its
owner's migration approval and use that migration workflow.

The session adapter receives `GET /api/auth/session` at a fixed HTTPS authority
origin with Cookie/Authorization forwarded by service binding. Its response is:

```json
{ "actor": { "id": "stable-editor-id", "roles": ["artifact-editor"] } }
```

401 means no session; a session without that role is 403. The existing account
system must map its own verified session into this contract; the exchange does
not issue passwords, invent sessions, trust a caller-supplied actor header, or
grant a role because a website uses an authenticated response policy. An
unconfigured identity or database returns 503.

All writes require a configured caller Origin, even for the editor. The site's
wrapper forwards only allowlisted routes to this service, with no automatic
redirect following. Cookies are not forwarded for public submission/revocation.
Intake is bounded at 64 KiB, rate limited, and initially private. No remote photo,
OCI layer, Mouseion document or arbitrary OG URL is fetched at intake.

## Routes

Website `/api/exchange/<route>` maps to the authority's `/<route>`.

| Method | Route | Access / result |
| --- | --- | --- |
| GET/HEAD | `/public/:collection` | Approved descriptors only; 200-item cursor pagination |
| POST | `/submit` | Optional public inbound intake; pending item and private receipt |
| POST | `/revoke` | Public sender receipt capability; withdrawal |
| GET/HEAD | `/inbox` | Editor only; private envelopes, 50-item cursor pagination |
| POST | `/import` | Editor only; inbound or outbound envelope |
| POST | `/import-interest` | Editor only; existing studio interest plus selected public descriptor |
| GET/HEAD | `/items/:id` | Editor only; exact item and recorded permission |
| POST | `/items/:id/permission` | Record exact-revision, scoped permission with evidence |
| POST | `/items/:id/publish` | Conditional SQL approval; permission still required |
| POST | `/items/:id/reject` | Editorial decline of pending item |
| POST | `/items/:id/withdraw` | Editor withdrawal / unpublication |
| GET/HEAD | `/items/:id/email` | Editor-only HTML/text export; pending exports visibly labeled |

Unknown paths are 404, unsupported methods 405, malformed input 400, bad Origin
403, oversized body 413, limited intake 429, missing infrastructure 503, and state
or revision conflicts 409. Every private response is `private, no-store`; public
SQL projections are also no-store so withdrawals take effect promptly.

## Start with Maria's gift

1. Build the inline example. Its `previews/maria-name.submission.json` is an
   outbound envelope containing the adapted gift.
2. Configure the identity/session adapter and the D1 binding. Import that JSON via
   the private inbox or authenticated `/import` API. It enters as pending.
3. Record `artifact` permission with `self-authored` evidence: this is Tobias's
   own requested keepsake and contains no byline, quote or portrait of Maria.
4. Use the Publish button, or the authenticated `/publish` API with
   `{ "revision": 1 }`.
5. Build the site with `source: "service"` and its explicit `exchangeService`
   Worker name. The collection now reads the SQL public view on each request.

To add a peer opinion, start from `../examples/incoming-quote.json`, replace the
placeholder text with exact agreed wording, and collect the actual permission.
The UI has no automatic “permission granted” switch at import. Use an email/form
evidence reference instead of self-authored evidence for peer content.

## Permission request body

```json
{
  "revision": 1,
  "scopes": ["artifact", "quote", "name", "profile", "photo"],
  "evidence": {
    "kind": "email",
    "reference": "Private mailbox message identifier containing permission for these exact fields"
  }
}
```

Include only scopes actually granted. The service rejects incomplete grants for
the requested public fields. Store evidence references privately; do not put a
correspondent's address or consent email into the public artifact body.

## Direct SQL and withdrawal

The UI uses the application API, whose editor authority provides the bound
`reviewed_by`. The final SQL transition is the same simple update described in
the extension README. A SQL operator can execute it after recording permission;
the trigger enforces the matching revision/scopes even outside the HTTP path.

Withdraw a recorded permission with:

```sql
UPDATE exchange_consents SET state = 'withdrawn' WHERE item_id = ?;
```

The trigger unpublishes the item. Existing static inline exports and delivered
emails are copies, not remotely revocable messages. The sender's receipt token
can request service withdrawal without an editor account; only its SHA-256 hash
is stored. Keep that capability out of public metadata and email card exports.

## Mailbox and photo handoffs

The shared studio contact directory implemented in the other session can be
connected through `EXCHANGE_PEERS_DB`. An editor sends:

```json
{ "interest_id": "existing-interest-uuid", "collection": "peer-voices", "artifact": { "schema": "ragbaz.artifact/v1", "...": "the chosen descriptor" } }
```

This illustration abbreviates the artifact; supply the full validated descriptor.
The bridge reads only an unexpired interest and its private contact name/email.
Any `quote` must occur verbatim in the received message. Its private envelope
retains the existing interest and peer IDs, so the agent can find the source again.
No contact or account is inserted, and no profile matching is inferred. Contact
consent does not populate public permission scopes: new publication permission
is still required. Public intake cannot supply an editor-owned source correlation.

The central artifact inbox lists these imported interests alongside received gifts
and outbound drafts. This is the handoff from the existing RAGBAZ contact inbox,
not an automatic subscription to every private message in that directory.

An inbox agent or mailbox adapter converts the received material into a private
submission envelope, then calls the editor-authorized import route. Sender and
recipient data is not automatically linked to accounts; supplied identity URLs
are review aids, not verified identities. Existing account/contact authorities
retain ownership of verified mailbox/account relationships.

For a portrait, record its source privately; agree on use; import the image through
the existing first-party media workflow; create the final immutable descriptor
with that hosted image path; record the matching `photo` grant. No background
scraper or inferred photograph is included.

Email exports are transport-neutral HTML/text alternatives. The mailbox provider
owns envelope headers, MIME assembly, actual send approval and delivery. This
implementation does not send or subscribe anyone as a side effect of publishing.
