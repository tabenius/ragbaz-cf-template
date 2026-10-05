# Website hardening review

Scope: the production Nostoi website, shared public Worker, contact intake,
peer storage and deployment scheduling. This is a focused code and behavior review,
not a claim of a complete penetration test of every RAGBAZ product or Cloudflare.

## Confirmed issues and fixes

| Priority | Finding | Fix and verification |
| --- | --- | --- |
| High | A default-locale path containing doubled slashes produced a protocol-relative redirect. The live `/en//example.invalid` response was 308 with `Location: //example.invalid`. | Reject ambiguous paths before redirects and adapter dispatch. Regression checks require 404/no Location while valid locale redirects retain their query. |
| Medium | An extension could register below the reserved contact prefix. | Check overlap symmetrically against the reserved API routes and between adapters. The reserved contact subtree now fails construction. |
| Medium | Media types were matched by prefix; malformed UTF-8 was silently replaced, and duplicate native form fields used inconsistent first/last-value semantics. | Match exact media types, decode UTF-8 strictly, require object envelopes and reject repeated fields. Tests verify refusal before any forwarding. |
| Medium | A reused request ID and identical body from another project could be acknowledged as a retry of the first project's event. | Require stored project and source domain to match, in both initial lookup and post-batch verification. Existing valid same-source retry hashes remain compatible. |
| Medium | Rate-limit counters continued increasing after the cap. | Saturate the atomic counter and reset on the next hour. Verify that refused attempts store no interests; supply Retry-After. |
| Medium | The published contact expiry policy had code for maintenance but the deployed Nostoi Worker had no cron. | Add an explicit production-only peerMaintenance flag and enable it for Nostoi. The daily handler expires shared peer records without needing an account database binding. |

## Operational boundaries

- Origin validation is a browser cross-site-request defense, not proof of a human
  or of mailbox control. Contact names and addresses remain submitted claims.
- Per-network-bucket throttling does not promise protection from a distributed
  denial of service. Edge-level abuse policies need their own operational evidence.
- The maintenance schedule is shared-table expiration; it does not migrate or
  delete DetCordon's legacy leads or RAGBAZ account rows. Its first scheduled run
  occurs after deployment, and future operational monitoring should confirm it.
- Authenticated integrations still own their identity and authorization checks.
  The review does not grant a security certification to the unfinished shared
  identity package or to the example artifact authority.

## Release evidence

Run the core and artifact suites, bundles, HTTP smoke and browser checks before
release. Verify the exact source revision and asset hashes after production
deployment. Live contact probes use fresh synthetic addresses and request IDs,
then remove only their own records. Verify malformed-body and redirect refusals
without sending personal information or redirecting a browser to an external host.
