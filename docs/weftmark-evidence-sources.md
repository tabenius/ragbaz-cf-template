# WeftMark Evidence Register: source and demonstration record

## Product sources

- WeftMark `README.md` and `assurance/facts.json`: prototype maturity and the
  distinctions between implementation, verification, review and releasability.
- `AGENTS.md`: Frog migration, native claims, scope and exact-head evidence.
- `docs/INSTALL.md`: source installation and the basic native workflow.
- `docs/security.md`: evidence-command runner is not a sandbox; public claims
  must retain product boundaries.
- `docs/contracts/runtime-status-v1.md`: optional runtime observations, native
  review versus Ephor, and deliberate Nostoi attestation wrappers.
- Rebekah `README.md`: runtime topology, service identities, gateway and opt-in
  governance. Rebekah remains a bootstrap, not a production-ready distribution.

This website is maintained in the template repository. It does not alter the
WeftMark or Rebekah runtimes, their authority or their assurance status.

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
assessment or legal conformity. The website's case explorer is a separately
labelled presentation-only illustration, not a second readiness engine.

The existing local console script has a stale pre-relocation shebang. Verification
used its actual interpreter with current source on PYTHONPATH rather than changing
another repository's environment. A fresh install as described on the page creates
the ordinary valid entry point.

## Legal sources, checked 5 October 2026

The EU AI Act discussion uses official Commission resources:

- [Current overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [AI Omnibus entry into force](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force)
- [Article 12](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12)
- [Article 19](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-19)
- [Article 26](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-26)

The Service Desk identifies its text as based on the consolidated Act at
27 July 2026. The original EUR-Lex OJ fetch returned no readable text in this
session, so the review relies on the accessible official Service Desk wording
and Commission overview rather than claiming independent extraction of that OJ.

High-risk obligations are mapped as engineering support, not as a blanket duty
for every coding assistant. Provider and deployer roles, intended purpose,
classification, control of logs, retention exceptions and current application
dates remain explicit. The current Commission timetable includes the July 2026
Omnibus amendments; repeating the original 2024 high-risk timetable would be
misleading. Technical evidence tools do not replace conformity assessment,
operational instrumentation, risk management, data governance or legal judgment.
