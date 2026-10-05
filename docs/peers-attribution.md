# Shared studio peers and ethical attribution

## Existing infrastructure, additive tables

Production reuses the existing `detcordon-marketing-leads` D1 database.
The new `ragbaz_*` tables are separate from DetCordon's `leads` and rate limits.
Ephor's marketing source sends email through Resend; its `ephor-audit-db`
contains audit data, not a shared contact directory. Do not put marketing data
in the audit database or alter audit-chain tables.

All four sites can bind the same `PEERS_DB`. Nostoi owns the shared daily
maintenance/reconciliation schedule and explicitly binds the existing
`ragbaz-cc-accounts` database for narrowly selected, opt-in account-match reads.
WeftMark does not need an additional cron or account binding. This consolidates
the work within the account's existing Workers Free cron allocation. Database
IDs are resolved at deployment or provided in the environment, never committed.

`migrations/peers/0001_peers.sql` adds the schema. The second migration imports
only active DetCordon lead records, preserving original expiry, purpose and
dates. It does not infer new attribution, notification or account-link consent.

## What is actually recorded

- A studio contact UUID and normalized email, first/last receipt time and expiry.
- A separate UUID for every interest, with project, domain, page, page-basis,
  optional name claim, message, purpose, consent choices and receipt time.
- A client time when supplied, clearly separate from the server receipt time.
- Optional campaign/referrer/country observations, each with a provenance basis
  and observation time. They are candidate explanations, not facts about intent.
- Requested matches to accounts with verified email, retaining account creation,
  verification and match-observation dates. Earlier message authorship stays
  unverified; account permissions are never changed by a contact form.

Email comparison trims and lowercases. It does not strip plus-tags, remove dots
or guess aliases. A shared address can be used by several people; a UUID is a
contact correlation key, not proof of one biological/legal person. The public
response exposes only the submission UUID, never the contact UUID or whether
the address has previously contacted the studio.

The current account table has no real-name field. Contact names are retained as
submitted claims. If a supported account column (`display_name`, `full_name` or
`name`) is added later, reconciliation retains each different declared name as
a sourced profile claim with account/source and observation dates. It neither
invents a missing name nor upgrades a declaration to verified legal identity.

## Consent, privacy signals and minimization

The form explains shared contact correlation before required contact consent.
Campaign/referrer attribution and future account matching have separate opt-ins.
Sec-GPC or DNT (including corresponding browser signals) suppress optional
attribution. A contact request does not subscribe the person or create an account.

No ad pixel, third-party analytics JavaScript, browser fingerprint, cross-site
cookie or hidden persistent browser identifier is used. Campaign parameters are
read only when the form is submitted with attribution consent. Referrer query
strings/search terms are excluded. Campaign values have a fixed allowlist and
length/character limits. Raw IP addresses and user-agent strings do not enter
peer/event records. Daily HMAC buckets support abuse control and expire after
two days. Ordinary Worker invocation logs are disabled to avoid retaining full
request URLs as an accidental second analytics store.

Messages/observations expire after 180 days. Minimal contact rows expire after
365 days without a new request. All dates remain until their record expires or
an appropriate deletion request is fulfilled. Account-match records are private
and qualified; they are not a loyalty score and do not prove who submitted a
previous message. Any favors or partnership decisions should be explicit human
decisions, not hidden automated profiling.

## Cloudflare settings and limits

Workers can read `request.cf.country` as a coarse network-country inference.
No account-wide analytics setting is required for the consented UTM/referrer
fields: the form supplies them to the same-origin endpoint. Enabling Cloudflare
IP Geolocation can also add CF-IPCountry for origin services, but it does not
recover a browser-suppressed referrer or establish a person's actual location.

Cloudflare's aggregate zone/Worker analytics can help with traffic and errors
without adding tracking JavaScript. If Logpush or request logging is enabled
elsewhere, configure field selection, query-string/IP minimization, access and
retention deliberately; that data is outside the peers schema. Do not use
Browser Insights, advertising identifiers or a third-party beacon merely to
make tracking less visible. Privacy-focused browsers are allowed to omit data.

A Google referrer is recorded as a candidate Google-search-or-navigation
source. Modern referrer policies normally hide the search query, and Cloudflare
cannot ethically reconstruct it from a header that was never sent. Campaign
links can use ordinary, declared utm_source/medium/campaign values instead.

## Operating the directory

Production deploys resolve the named existing databases. Set `PEER_HASH_KEY`
with Wrangler secret input; it must not enter source, argv or logs. Apply the
additive migrations before enabling the forms. Take any D1 export backup into
restricted box-local storage, never the public Git repository.

Staff can query the namespaced tables through authenticated D1 tooling. There
is no public peer lookup/read endpoint. For access, correction and deletion,
verify address control appropriately; do not act on another person's record
solely because an unauthenticated form named their email.

Deployment tests use a reserved example.invalid address and known submission
IDs, verify shared UUID/source/date behavior, and remove only those test records.
