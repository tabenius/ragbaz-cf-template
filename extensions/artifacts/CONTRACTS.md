# Artifact and sharing contracts, version 1

## Public artifact descriptor

`ragbaz.artifact/v1` is deliberately purpose-neutral: gifts, quotations,
publications, software releases, acknowledgements, and replies can all use it.

| Field | Meaning |
| --- | --- |
| `id` | Stable, URL-safe ID, independent of the title |
| `kind` | Semantic kind; open slug vocabulary, such as gift/quote/document/software |
| `title` | Short heading, at most 240 characters |
| `ingress` | Introductory excerpt, at most 1,200 characters |
| `quote` | Optional exact attributed wording, not an inferred endorsement |
| `person` | Optional public byline with chosen name, role, profile/identity links, portrait |
| `image` | First-party thumbnail/illustration with descriptive alternative text |
| `social_image` | Optional first-party raster OG cover, distinct from a thumbnail |
| `presentation` | card/thumbnail/quote/box/og; presentation does not alter permissions |
| `created_at` | Claimed artifact creation time in UTC; not publication or receipt time |
| `resources[]` | Zero or more typed external/local/Mouseion/OCI references |
| `body[]` | Plain-text sections for a full singleton or permalink page |
| `tags[]` | Lightweight topic labels |
| `relations[]` | Typed links to other artifact IDs, such as reply-to or complements |

Resource MIME type (`media_type`), exact size (`bytes`), identifier, digest, URL,
and label are independent fields. Unknown size is omitted, not guessed. OCI
references require an immutable SHA-256 digest; storing a digest does not verify
its bytes. Resource URLs use HTTPS without credentials or clean mounted local
paths. The renderer does not fetch remote metadata or execute referenced content.

Images and portraits use a first-party `/assets/` path. A peer's photograph must
be selected and hosted through the existing media-owner workflow with their
permission. A private `photo_source_url` can help that review; it does not become
a public picture or a crawler instruction. Safe initials stand in for a missing
portrait. A supplied institutional/ORCID/profile link is not an identity proof.

## Private sharing envelope

`ragbaz.artifact-submission/v1` wraps a descriptor with:

- `collection`: routing to an explicit receiving collection.
- `direction`: inbound or outbound, from the perspective of this publisher.
- `sender` / `recipient`: private contact names, emails, profile or photo-source links.
- `permission`: offered scopes and a private note, not approval.
- `in_reply_to`: optional conversational link to an earlier artifact ID.
- `source`: private source-system/message/interest and person-correlation references,
  with their observation time. These references are editor-owned at intake.

Both directions use the same envelope. An agent may convert received email or a
publicly shared artifact into that envelope after checking the source and exact
wording. It must not invent the person's opinion, identity, consent or photograph.
The first-party form records explicit checkbox selections as an offer; the
operator reviews their context before recording publishable permission.

Permission lives alongside an immutable item revision, with evidence kind,
reference, scopes, recorder and time. Evidence kinds are email, form, signed, or
self-authored. Self-authored is limited to outbound work without a peer byline;
it cannot grant permission for somebody else's quote or portrait.

## Publication boundary

`exchange_items.envelope_json` is private. Only `public_json`, after the approved
state and matching permission, crosses the SQL public view. Required scopes are
derived from validated fields; clients cannot supply a reduced scope list.

- Always require `artifact`.
- Quote present: require `quote`.
- Public person present: require `name`.
- Portrait present: require `photo`.
- Profile/identity links present: require `profile`.

Creation, receipt, permission recording and publication times remain separate.
Pending, approved, rejected and withdrawn are sharing states, not software
maturity labels. A rejected or withdrawn item cannot be republished by repeating
the old approval; a new sharing event requires a new ID and review.

## Four projections, one source

1. **Card/box:** escaped public descriptor with an optional quote and attribution.
2. **Standalone:** full text sections, resource metadata and canonical/social tags.
3. **Machine-readable:** the public descriptor, never the private envelope.
4. **Email:** HTML and plain-text alternatives, absolute public links, no scripts.

An external OG preview is represented by deliberately supplied title, excerpt,
image and resource link. A future OG-fetch adapter may map metadata into this
contract, but it must have its own URL-fetch and provenance policy. This version
does not pretend that it has inspected every linked page.

## Growth paths

The versioned namespace leaves clear seams for mailbox importers, Mouseion
provenance, OCI inventory, hosted portraits, an identity authority and email
delivery. The initial reply relation gives a conversational thread anchor without
claiming realtime messaging, encryption, delivery receipts or end-to-end identity.
New private envelope fields or public resource kinds should be versioned; do not
silently widen a public projection with unrelated internal data.
