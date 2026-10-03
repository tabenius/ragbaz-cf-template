# Continuing inheritance with Git, GitHub and Frog

## Recommendation: a pinned source dependency

Use `ragbaz-cf-template` as a **Git submodule**, pinned to a reviewed release
commit, in each independent site repository or product's `marketing/` directory.
GitHub's template-repository feature is convenient for initial scaffolding but
does not establish shared ancestry or deliver updates. Use it only for the
project-owned skeleton; shared code still comes from a pinned dependency.

The initial four sites in this repository import the core directly. They have
independent Worker names and output directories, and can stay together while
the first core contract settles. Their content ownership is explicit.

## After the upstream's first reviewed publication

Upstream: `https://github.com/tabenius/ragbaz-cf-template.git`.
Use a reviewed release commit, not the moving `main` branch.

For a new site, initialize Git, then add the shared source:

```sh
git submodule add https://github.com/tabenius/ragbaz-cf-template.git vendor/ragbaz-cf-template
git -C vendor/ragbaz-cf-template checkout <full-reviewed-release-commit>
```

The site's package scripts call the pinned build tool:

```json
{
  "build": "node vendor/ragbaz-cf-template/scripts/build-single.mjs site.json build",
  "dev": "npm run build && wrangler dev --config build/wrangler.json",
  "bundle": "npm run build && wrangler deploy --dry-run --config build/wrangler.json --outdir build/bundle",
  "deploy": "npm run build && wrangler deploy --config build/wrangler.production.json"
}
```

Pin Wrangler and commit the downstream npm lockfile too. CI checks out
submodules and runs clean install, downstream content/contract tests, build and
Worker dry-run. The parent commit contains the exact upstream gitlink: a branch
name or “latest” is not a release pin.

The current offline scaffold emits `template.lock.json` with hashes of every
copied invariant file. To convert it, first verify those files are unmodified,
then replace only the tracked snapshot with the submodule in a scoped PR.
Retain editable `site.json`, the site's history and its build commands. A
snapshot hash inventory records bytes; it is not an attestation or Git release.

## Updating the pin

1. Create a Frog task for the upstream fix. Claim exact template files and
   verify shared refusal tests and each consumer build.
2. Review and publish a versioned upstream release with a changelog and migration
   notes. No downstream is changed by publishing alone.
3. Create a downstream Frog task and update PR. Fetch upstream, inspect the
   release diff, check out its full reviewed commit, and update the gitlink.
4. Run downstream checks (including product-specific APIs/publication gates).
   Record evidence, author/independent review accurately, and the old/new pins.
5. Merge/deploy deliberately. Rollback selects the prior parent commit or
   prior Cloudflare deployment; do not roll back a data migration by assumption.

An updater GitHub Action can open pin-update PRs after a release. Give it only
the permission to create a branch/PR in the consumer. It must not auto-merge,
deploy, or publish private documents. Use repository_dispatch or a scheduled
release check; Frog tasks record dependency and acceptance intent. Auth tokens
remain in GitHub secrets, not task notes or generated configs.

## Alternatives and when they fit

- **Versioned npm package:** later, when the shared API is stable and publication
  is useful beyond the fleet. Lock the package version; keep source provenance.
- **Git subtree:** useful where submodules are a practical obstacle. Keep a
  clearly isolated prefix and an explicit upstream revision; update by reviewed
  subtree merges. Do not blend generated content into that prefix.
- **Separate site repo:** useful when public contributors must never access a
  private product repo. Feed it only approved public artifacts, with digests.
  It introduces another repository, synchronization boundary and Frog task flow.

Do not merge unrelated template Git history into the root of a product repo
just to make it “inherit”. Content and invariants need separate ownership.

## Frog ceremony

Use the configured workspace; register only the intended checkout root, not `/`.
Resolve identity via `frog repo key`. Register the remote normally after GitHub
publication, then re-check identity/mapping rather than inventing a new key.
Declare downstream dependencies with the shipped `frog repo dep` CLI once the
repos are registered; inspect `--help` for its current grammar.

```sh
frog repo discover --root /path/to/site --no-scan
frog task list --repo <site-name>
frog lock list --repo <site-name>
frog task create --repo <site-name> --slug site-template-update --title "Update template pin" \
  --why "Adopt the reviewed website fix" --what "Pin update and consumer evidence" --priority p2 \
  --file vendor/ragbaz-cf-template
frog task claim site-template-update --agent <agent> --file vendor/ragbaz-cf-template
```

Use workflow `review` while review/publication gates remain. Finish only when
acceptance actually holds. Frog snapshots and audit chains record operational
history; they do not replace Git's source commits or independent review.
