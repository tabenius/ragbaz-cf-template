# Initial task intent

Live assignment/locks are in Frog. This file preserves acceptance intent even
when the local coordination database is unavailable.

| Frog slug | Scope | Acceptance |
|---|---|---|
| `cf-template-core` | core, assets, scripts, tests, docs, CI, dependency lock | validated text renderer; explicit canonical URLs; security headers on every outcome; GET/HEAD, 404/405/503 refusal checks; exact token provenance; clean build and Wrangler dry-runs |
| `cf-project-websites` | `sites/` | four factual project configurations; distinct Worker names/domains/output; prototype/development status stated; no claim that website health means runtime health |
| `cf-detcordon-adoption` | `docs/detcordon-adoption.md` | identifies existing production source; compares in-place and separate-repo models; preserves pilot API, public URL inventory and approved-block publisher |
| `cf-template-publication` | release/publication/deployment setup | review and first source commit; create GitHub repo and release; configure consumer pin updates; deploy each selected site and run external smoke checks |

Public-contract changes need refusal tests and review evidence. Initial checks
are `npm ci`, `npm run check`, `npm run bundle`, plus workerd smoke checks.
Passing local evidence leaves tasks in review until publication/review gates are
actually satisfied. No automatic commits, GitHub publication or deployment is
implied by those checks.

Authenticated project API gateways, native edge services/storage, and
DetCordon downstream adoption need distinct tasks. Their acceptance must be
product-specific rather than inheriting a website's tests.

## Fleet v1 slice

`cf-fleet-p0-p1` owns `src/`, `assets/`, `scripts/`, `tests/`, `sites/`, `docs/`,
README and agent guidance. Acceptance: v0 compatibility; stable multi-page and
mounted/locale routing; accurate lifecycle/fallback projections; cookie-aware
policies; approved public documents/assets; contact refusal controls; portable
scaffold; exact asset inventories; all consumer builds and workerd checks.

The aspect-specific priority matrix and follow-on task names are in
`fleet-roadmap.md`. The contact UI remains disabled in the initial consumers
until a receiving service and its delivery/retention policy are configured.
