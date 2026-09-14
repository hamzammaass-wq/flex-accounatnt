# Secret exposure remediation

This repository previously tracked production credentials. Removing the files or
literals prevents continued exposure in the current tree, but it does not revoke
the credentials and it does not remove them from Git history.

## Immediate actions (outside Git)

Complete these before treating the incident as closed:

- [ ] Rotate the Neon database password/role credential.
- [ ] Update the new database URL in every authorized runtime secret store.
- [ ] Redeploy or restart each backend that consumes the database credential.
- [ ] Revoke the old database credential and verify it can no longer connect.
- [ ] Rotate the Paddle API key.
- [ ] Update the new Paddle key in every authorized backend/function secret store.
- [ ] Redeploy affected services, revoke the old Paddle key, and review Paddle
      activity logs for unexpected administrative or billing changes.
- [ ] Do not paste either old or new credential into issues, PR comments, logs,
      screenshots, chat, or source-controlled files.

Rotation is required even if the repository is private. Anyone with access to an
old clone, fork, cache, artifact, or commit may still possess the exposed values.

## Repository protections

- Environment files are ignored except for safe `.env.example` templates.
- Operational scripts must read secrets from environment variables and fail
  closed when required values are absent.
- The Secret Scan workflow checks the current source tree on pull requests and
  pushes to `main`.
- Enable GitHub secret scanning and push protection in repository settings when
  available.
- Keep production secrets in the deployment platform's encrypted secret store,
  with least-privilege credentials and a documented owner/rotation date.

## Historical cleanup (separate coordinated task)

Credential rotation is the first and mandatory containment step. History cleanup
may reduce accidental rediscovery, but it is not a substitute for rotation.

Do not rewrite history as part of an ordinary feature PR. If cleanup is approved,
schedule it separately, notify every collaborator, inventory forks and protected
branches/tags, back up the repository, use a reviewed tool such as
`git filter-repo`, and coordinate any required force-push. Contributors must
then discard or carefully repair old clones so the secret is not reintroduced.

## Verification evidence

Record only non-secret evidence:

- rotation timestamps and responsible owner;
- affected environments that were updated and redeployed;
- confirmation that old credentials were revoked;
- links to passing Secret Scan runs;
- the separately approved history-cleanup decision.
