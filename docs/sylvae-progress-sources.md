# Sylvae Grove Register: source and demonstration record

## Product sources

- Sylvae `README.md`: five backends, tier frontmatter and routing table,
  documented token/cost trimming, WeftMark correlation, review page, run
  listing, MCP guards and Nostoi audit wrappers.
- `docs/phase1-comparison.md` and `docs/phase1-runs.jsonl`: the Phase-1
  cross-backend comparison with raw evidence records.
- `docs/security.md`: evidence-command runner is not a sandbox; backends
  perform real work at real cost.
- `pyproject.toml`: version 0.1.0.
- WeftMark `docs/contracts/runtime-status-v1.md`: deliberate Nostoi
  attestation wrappers and the separation of native review from governance.

This website is maintained in the template repository. It does not alter the
Sylvae runtime, its authority or its prototype status.

## Example verification

The native workflow was exercised in a fresh disposable Git repository on
5 October 2026, using the local WeftMark source and an existing interpreter:

1. Commit a harmless fixture and create a scoped Change Set.
2. Run a small file-existence check, then review with required test evidence.
   Outcome: ready.
3. Commit another revision and refresh. Retained evidence still refers to the
   old head; the review outcome is stale, with CLI exit 5.
4. Rerun the small check at the new clean head and review again. Outcome: ready.
5. Verify the generated `weftmark-ledger-v1` ledger with the local Nostoi CLI.
   Outcome: intact.

The review author is a synthetic example author. This demonstrates exact-head
freshness and format interoperability, not independent approval, a security
assessment or legal conformity. The website's routing-desk explorer is a
separately labelled presentation-only illustration, not a second routing engine.

The existing local console script has a stale pre-relocation shebang. Verification
used its actual interpreter with current source on PYTHONPATH rather than changing
another repository's environment. A fresh install as described on the page creates
the ordinary valid entry point.

## Roadmap basis

Automatic backend routing is deliberately deferred. The comparison report makes
resolution gaps and the missing interactive review flow preconditions; until
they close, explicit routing is the contract. The page states this ordering
rather than promising a router, and lists smaller verifiable steps first.
