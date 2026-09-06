---
title: CI/CD
slug: ci-cd
type: guide
domain: 01-devops
tags: [ci-cd, automation, pipelines]
keywords: [continuous integration, continuous delivery, pipeline, github actions, build, test, deploy, artifact, rollback]
level: 2
status: stable
prerequisites: [git, docker]
related: [docker-images, terraform]
updated: 2026-09-06
---

# CI/CD

> CI answers "did this change break anything?" CD answers "can this change reach users safely?" They are different problems and people conflate them constantly.

## What is it?

| | Stands for | Question it answers |
|:---|:---|:---|
| **CI** | Continuous Integration | Does the code still build and pass its tests? |
| **CD** | Continuous **Delivery** | Is every passing build *ready* to release? (a human clicks) |
| **CD** | Continuous **Deployment** | Every passing build *is* released, automatically |

Both CDs are legitimate. Most teams want continuous **delivery** — automated all
the way to production-ready, with a deliberate decision to release.

## Why it exists

Manual releases fail in predictable ways: a step gets skipped, it works on one
person's machine, nobody remembers exactly what was deployed, and rolling back
means reconstructing history from memory.

A pipeline makes the process **written down, repeatable and identical every
time**. The point is not speed — it is that the same steps run in the same order
whether you are calm on a Tuesday or panicking on a Friday.

## What a pipeline is made of

```diagram
   push / pull request
      │
      ▼
   ① BUILD      compile, build the image        fail fast, cheapest first
      │
      ▼
   ② TEST       unit → integration → lint
      │
      ▼
   ③ PACKAGE    tag the artifact with the Git SHA
      │
      ▼
   ④ PUBLISH    push to a registry
      │
      ▼
   ⑤ DEPLOY staging     automatic
      │
      ▼
   ⑥ VERIFY     smoke tests against staging
      │
      ▼
   ⑦ DEPLOY production   automatic (deployment) or gated (delivery)
```

| Stage | Should be | Why |
|:---|:---|:---|
| Build | Fast, deterministic | Runs on every push |
| Test | Ordered cheapest-first | Fail in 30s, not 30 minutes |
| Package | **Once** | Build one artifact, promote it everywhere |
| Deploy | Repeatable, reversible | You will need to undo it |

:::key Build once, promote the same artifact
Rebuilding for each environment means staging and production run **different
bytes** — different base-image patches, different transitive dependencies. Your
staging test then proves nothing about production.

Build one image, tag it with the Git SHA, and promote **that exact image**
through each environment. Configuration changes between environments; the
artifact does not.
:::

## How to use it — a real GitHub Actions pipeline

```yaml title=".github/workflows/deploy.yml"
name: Build and deploy

on:
  push:
    branches: [main]
  pull_request:            # run tests on PRs, but do not deploy

# Cancel an in-progress run when a newer commit is pushed to the same branch.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm            # cache dependencies between runs

      # `npm ci` respects the lockfile exactly. `npm install` may resolve
      # different versions, which defeats the point of testing.
      - run: npm ci
      - run: npm run lint
      - run: npm test

  build-and-push:
    needs: test                 # only if tests passed
    if: github.ref == 'refs/heads/main'    # not on pull requests
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          push: true
          # Tag with the commit SHA: immutable, traceable, never ambiguous.
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production     # attach required reviewers here for delivery
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Kubernetes
        run: |
          kubectl set image deploy/web \
            web=ghcr.io/${{ github.repository }}:${{ github.sha }}
          # Waits for the rollout and FAILS the job if it does not succeed —
          # without this, the pipeline goes green on a broken deploy.
          kubectl rollout status deploy/web --timeout=5m
```

### The details that matter in that file

| Line | Why it is there |
|:---|:---|
| `concurrency` + `cancel-in-progress` | Stops five queued runs when you push five times |
| `cache: npm` | Dependency install goes from minutes to seconds |
| `npm ci`, not `npm install` | Installs the lockfile exactly |
| `needs: test` | Nothing is published unless tests pass |
| `if: github.ref == ...main` | PRs are tested but never deployed |
| Tag = `github.sha` | Immutable and traceable to a commit |
| `environment: production` | Where you attach manual approval |
| `rollout status --timeout` | **Fails the job if the deploy fails** |

:::danger A pipeline that reports success on a failed deploy
`kubectl set image` returns immediately — it only records the desired state. If
the new pods crash-loop, the command has already succeeded and your pipeline
goes green while production is broken.

`kubectl rollout status --timeout=5m` waits for pods to become Ready and exits
non-zero if they do not. Without it your pipeline is lying to you, which is
worse than having no pipeline.

The same applies to any deploy tool: **always wait for and verify the result.**
:::

## Secrets

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

| Rule | Why |
|:---|:---|
| Never commit secrets | Git history is forever, and the remote already has it |
| Use the platform's secret store | Encrypted, masked in logs, access-controlled |
| Scope by environment | Staging credentials must not reach production |
| Prefer short-lived tokens (OIDC) | Nothing long-lived to steal |
| Rotate after any exposure | Deleting the commit does not help |

:::warn Secrets are masked in logs, not hidden from the job
Every step in the job can read the secret. A malicious or compromised
third-party action in your pipeline can exfiltrate it.

So: pin actions to a commit SHA rather than a moving tag, grant the minimum
`permissions:`, and prefer OIDC federation over stored long-lived cloud keys.
:::

## Deployment strategies

| Strategy | How it works | Cost |
|:---|:---|:---|
| **Recreate** | Stop old, start new | Downtime. Simple |
| **Rolling** | Replace a few at a time | Two versions live at once |
| **Blue/green** | Full second environment, switch traffic | Double infrastructure; instant rollback |
| **Canary** | 5% of traffic first, then grow | Best risk control; needs good metrics |

Rolling is the Kubernetes default and the right starting point. Canary is worth
it once you have metrics good enough to *detect* the problem in that 5%.

:::warn Rolling updates mean two versions run simultaneously
For a few minutes, old and new pods both serve traffic and both talk to the same
database. Which means:

- **Database migrations must be backwards-compatible.** Adding a nullable column
  is safe; renaming or dropping one breaks the version still running.
- **APIs must tolerate both versions.** Two-phase changes: deploy code that
  accepts old and new formats, then switch the producer, then remove the old
  path.

This constraint is not obvious until it causes an outage during an ordinary
deploy.
:::

## What makes a pipeline good

```diagram
   FAST         under 10 minutes, or people stop waiting for it
   RELIABLE     a red build means broken code, never flakiness
   REVERSIBLE   rollback is one command and is practised
   VISIBLE      the log says what failed, not just that it failed
```

:::danger Flaky tests destroy a pipeline's value
One test that fails 5% of the time teaches the whole team to re-run red builds
without reading them. From then on, real failures get re-run too.

A flaky test is worse than a missing test. Fix it or delete it — leaving it is
the only option that damages you.
:::

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| Passes locally, fails in CI | Different versions, or uncommitted files | Pin versions; check `.gitignore` |
| Slow pipeline | No caching; slow tests run first | Cache dependencies; reorder |
| Deploy "succeeds", app is broken | Not waiting for the rollout | `rollout status --timeout` |
| Secret leaked in logs | Echoed, or in an error message | Rotate it; use the secret store |
| Two runs deploy at once | No concurrency control | `concurrency:` group |
| Cannot tell what is deployed | Mutable tags | Tag with the Git SHA |

## Key takeaways

- **CI = does it work. CD = can it ship.** Different problems.
- **Build once, promote the same artifact.** Rebuilding per environment
  invalidates your testing.
- **Tag with the Git SHA.** Immutable and traceable.
- **Always wait for and verify the deploy** — otherwise green means nothing.
- **Rolling updates run two versions at once**, so migrations must be
  backwards-compatible.
- **Fix or delete flaky tests.** They teach people to ignore red builds.
- **Rollback must be one command**, and you must have practised it.
