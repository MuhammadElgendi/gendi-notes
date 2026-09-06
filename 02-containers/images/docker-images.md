---
title: Docker Images and Registries
slug: docker-images
type: guide
domain: 02-containers
tags: [docker, images, registry, layers]
keywords: [layer, tag, digest, multi-stage, alpine, distroless, dockerfile, cache, push, pull, scan]
level: 2
status: stable
prerequisites: [docker]
related: [ci-cd, kubernetes-basics]
updated: 2026-09-06
---

# Docker Images and Registries

> An image is a stack of read-only layers. Understanding that one fact explains build caching, image size, and why deleted secrets are still in there.

## What is it?

An image is the packaged, immutable result of a build: your application, its
dependencies, and a small filesystem, ready to run anywhere.

It is not one file. It is a **stack of layers**, each recording the filesystem
changes made by one build instruction.

```diagram
   Dockerfile                 resulting layers
   ──────────                 ────────────────
   FROM node:22-alpine   →    [ base OS + node        ]  ← shared with other images
   WORKDIR /app          →    [ (metadata only)       ]
   COPY package*.json ./ →    [ + package.json        ]
   RUN npm ci            →    [ + node_modules        ]  ← the big, slow one
   COPY . .              →    [ + your source         ]
   CMD [...]             →    [ (metadata only)       ]

   a container adds one thin WRITABLE layer on top
```

## Why layers exist

Two big wins, and one trap.

**Caching.** If an instruction and its inputs have not changed, Docker reuses
the existing layer instead of re-running it. This is why build order matters
enormously.

**Sharing.** Ten images built `FROM node:22-alpine` store that base **once**.
Pulling the tenth downloads only its unique layers.

**The trap:** layers are append-only. A file added in one layer and deleted in a
later one is still present in the earlier layer, and anyone with the image can
extract it.

## How to use it

### Write a Dockerfile that caches well

Order instructions from **least likely to change** to **most likely**:

```dockerfile title="Ordered for caching"
FROM node:22-alpine

WORKDIR /app

# Changes rarely → stays cached across every source edit
COPY package*.json ./
RUN npm ci --omit=dev

# Changes constantly → put it last
COPY . .

CMD ["node", "server.js"]
```

:::danger One wrong line ruins every build
```dockerfile
COPY . .                  # ← invalidates the cache on ANY file change
RUN npm ci                # ← so this re-runs every single time
```

Because `COPY . .` comes first, editing one character in a source file changes
that layer, which invalidates everything after it — including the slow
dependency install.

Same file, correct order: a 5-second rebuild. Wrong order: 3 minutes, every
time. This is the highest-value Dockerfile rule there is.
:::

### Multi-stage builds — the fix for huge images

Compile with a full toolchain, then copy only the result into a clean image:

```dockerfile title="Multi-stage: compilers never reach production"
# ---- stage 1: build (has the full toolchain) ----
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- stage 2: runtime (only what is needed to run) ----
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
CMD ["node", "dist/server.js"]
```

Nothing from stage 1 exists in the final image — no compilers, no build caches,
no dev dependencies. Typically a 5–10× size reduction, and a much smaller attack
surface.

### Always add `.dockerignore`

Without it, `COPY . .` uploads your entire directory into the build:

```text title=".dockerignore"
node_modules
.git
.env
*.log
dist
Dockerfile
```

This makes builds faster **and** stops local secrets and `.git` history from
ending up in the image.

### Choosing a base image

| Base | Size | Trade-off |
|:---|:---|:---|
| `node:22` | ~1.1 GB | Everything included. Fine for a build stage |
| `node:22-slim` | ~250 MB | Debian, trimmed. Good default |
| `node:22-alpine` | ~150 MB | Smallest with a shell. Uses musl, not glibc |
| `gcr.io/distroless/nodejs22` | ~120 MB | No shell at all. Most secure, hardest to debug |

:::warn Alpine uses musl libc, not glibc
Most things work. What breaks: native modules compiled against glibc, and some
prebuilt binaries. The symptom is a cryptic `Error loading shared library` or
`not found` on a binary that clearly exists.

Alpine is an excellent default — but if you hit odd native-dependency errors,
try `-slim` before spending an afternoon on it.
:::

### Tags, digests, and why `latest` is dangerous

```sh
docker build -t myapp:1.4.2 -t myapp:latest .
docker push myapp:1.4.2
```

| Reference | Immutable? |
|:---|:---|
| `myapp:latest` | **No** — just a label someone can move |
| `myapp:1.4.2` | Only by convention. It *can* be overwritten |
| `myapp@sha256:abc123...` | **Yes** — a content hash |

:::danger `latest` means "whatever was pushed last"
It is not resolved dynamically and it carries no meaning. Two deploys of
"`myapp:latest`" a week apart can run completely different code — which brings
back "works on my machine", now inside Docker.

In production, deploy an **immutable tag** (a version or the Git SHA) or a
digest. Kubernetes with `latest` and `imagePullPolicy: Always` gives you a
cluster where different pods may quietly be running different builds.

A good CI convention: tag with the commit SHA, and additionally move a
`latest`/`stable` label if humans need one.
:::

```sh
# Pin exactly, by digest — the same bytes forever
docker pull myapp@sha256:abc123...

# Find the digest of what you have
docker inspect --format='{{index .RepoDigests 0}}' myapp:1.4.2
```

### Registries

```sh
docker login registry.example.com
docker tag myapp:1.4.2 registry.example.com/team/myapp:1.4.2
docker push registry.example.com/team/myapp:1.4.2
docker pull registry.example.com/team/myapp:1.4.2
```

An image name is really `registry/namespace/name:tag`. When the registry is
omitted, Docker assumes Docker Hub — which is why `nginx` works and why hitting
Docker Hub's anonymous rate limit in CI is so common. Authenticate, or use a
mirror.

## Inspecting and shrinking

```sh
docker images                              # sizes
docker history myapp:1.4.2                 # SIZE PER LAYER — find the fat one
docker image inspect myapp:1.4.2

# What is actually inside? A shell in a throwaway container.
docker run --rm -it --entrypoint sh myapp:1.4.2

docker system df                           # what is using disk
docker builder prune                        # clear the build cache
docker system prune -a                      # remove unused images too
```

`docker history` is the tool for size problems. It shows exactly which
instruction added the 400 MB.

:::danger A secret in any layer is in the image forever
```dockerfile
COPY .env /app/.env
RUN rm /app/.env          # does NOT remove it from the image
```

The earlier layer still contains the file. `docker history` reveals it and it
can be extracted from the layer tarball.

Correct approaches:
- **Runtime**: pass secrets as environment variables or mounted files.
- **Build time**: BuildKit secret mounts, which are never persisted:

```dockerfile
RUN --mount=type=secret,id=npmrc \
    npm ci --userconfig=/run/secrets/npmrc
```
```sh
docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
```

If a secret has already been pushed: **rotate the secret**. Rewriting the image
does not help — it may already have been pulled.
:::

## Security basics worth doing

```dockerfile
# Run as a non-root user. Many base images provide one.
USER node

# Or create one
RUN adduser -D -u 10001 appuser
USER appuser
```

```sh
docker scout cves myapp:1.4.2    # scan for known vulnerabilities
# or: trivy image myapp:1.4.2
```

Containers run as root by default. If an attacker escapes the process, root
inside the container is a much better starting position than an unprivileged
user. Adding two lines removes that.

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| Every build is slow | `COPY . .` before dependency install | Reorder |
| Image is 1.5 GB | Build tools in the final image | Multi-stage + slim base |
| `exec format error` | Wrong CPU architecture (arm64 vs amd64) | `docker build --platform linux/amd64` |
| `no such file or directory` on a binary that exists | musl vs glibc on Alpine | Use `-slim` |
| Code change not taking effect | Ran the old image, or cached layer | Check the tag; `--no-cache` to confirm |
| `toomanyrequests` in CI | Docker Hub anonymous rate limit | Authenticate, or mirror |
| Different pods, different code | Deployed `latest` | Deploy immutable tags |

## Key takeaways

- An image is a **stack of append-only layers**. Nothing is ever really removed.
- **Order the Dockerfile least-changing first.** Dependencies before source.
- **Multi-stage builds** keep compilers out of production — usually 5–10×
  smaller.
- **`.dockerignore`** speeds builds and keeps `.git` and `.env` out.
- **Never deploy `latest`.** Use a version or the Git SHA.
- **A secret in a layer is in the image.** Use BuildKit secret mounts; if it
  leaked, rotate it.
- **`docker history`** finds the layer that made your image huge.
- Add **`USER`** — do not run as root.
