# Development Workflow

## Main branch is the single baseline

`main` is the only approved baseline for new development. It must remain
buildable, reviewable, and suitable for deployment.

Every new feature, fix, refactor, migration, or documentation change must:

1. Start from the latest remote `main`.
2. Be developed on a new, purpose-specific branch.
3. Be committed and pushed to that branch.
4. Pass the relevant type checks, tests, and production build.
5. Return to `main` through a pull request or an explicitly approved merge.

Do not create a new feature branch from another feature branch. Stacked
branches are allowed only when their dependency is explicit and approved.

## Starting work

```bash
git checkout main
git pull origin main
git checkout -b <type>/<short-description>
```

Use a clear branch type such as `feature`, `fix`, `docs`, or `refactor`.
Automated Cursor branches must follow the branch naming policy supplied by
the agent environment.

Before coding, verify that the branch merge base is the current remote
`main`:

```bash
git merge-base --is-ancestor origin/main HEAD
```

## Completing work

Run checks appropriate to the changed scope. For the frontend baseline:

```bash
npm run lint
npm run build
```

Then commit and push the branch:

```bash
git add <files>
git commit -m "<type>: <reason for the change>"
git push -u origin <branch-name>
```

The pull request base must be `main`. After the change is merged, update local
`main` before starting any further branch.

## Main branch protections

- Do not develop features directly on `main`.
- Do not force-push `main`.
- Do not rewrite published history.
- Do not commit `.env`, secret keys, database passwords, credentials, or
  Supabase `service_role` keys.
- Browser-safe Supabase publishable keys may be used by the frontend, but
  privileged keys must remain in managed secrets.
- Keep unrelated changes in separate branches and commits.
- Resolve conflicts in the feature branch against the latest `main` before
  final integration.

## Definition of done

A branch is ready to integrate only when:

- the requested behavior is implemented;
- documentation and migrations are included where applicable;
- lint, tests, and build checks pass for the affected scope;
- no secret or generated build output is committed;
- the pull request accurately describes changes and validation;
- the branch is pushed and the working tree is clean.
