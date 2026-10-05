# Artifact exchange extension

Read the repository's instructions first. This directory is an additive,
composable extension: the template owns public rendering/security invariants;
`authority/` is an example application that owns inbox, SQL, consent and review.
Do not couple the core homepage to this application's database schema.

Public cards, inline data, OG metadata and email exports use the same explicit
public projection. Contact details, permission evidence and pending items never
enter that projection. Permission and editorial approval are separate decisions.
Treat imported content as text and descriptors, never executable HTML or an
arbitrary URL-fetch instruction. Mouseion and OCI entries are references, not
claims that an artifact has been downloaded or cryptographically verified.

Run `node --test extensions/artifacts/tests/*.test.mjs`, the example build,
and the repository's required checks. New HTTP behavior needs refusal tests.
An example or a local preview is not a deployed service or a delivered email.
