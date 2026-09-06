---
title: Docker
slug: docker
type: guide
domain: 02-containers
tags: [docker, containers, images]
keywords: [dockerfile, container, image, registry, compose, build, volume]
level: 1
status: stable
prerequisites: []
related: [docker-images, kubernetes-basics]
updated: 2026-09-06
---

# Docker

> Docker packages an application together with everything it needs to run, so the same package behaves identically on your laptop and in production.

## What is it?

Docker is a tool for building and running **containers**. A container is your
application plus its libraries, runtime and configuration, bundled into one
unit that runs the same way anywhere.

You use it in three steps that never really change:

```diagram
   Dockerfile          Image              Container
   ──────────          ─────              ─────────
   a recipe     build   a frozen    run    a running
   you write    ────→   snapshot    ────→  process
                        (read-only)        (has state)
```

## Why it exists

The problem was "it works on my machine". An app needs a specific Python
version, three system libraries and two environment variables — and the server
has different ones.

The old fixes were painful. Install everything on the server by hand and hope
nobody changes it. Or ship a whole virtual machine: a full guest operating
system, gigabytes in size, a minute to boot.

Docker's answer: package **only the application and its dependencies**, and
share the host's operating system kernel.

| | Virtual machine | Container |
|:---|:---|:---|
| Contains | A whole guest OS | Just the app and its libraries |
| Size | Gigabytes | Tens of megabytes |
| Start time | ~30–60 seconds | Under a second |
| Isolation | Very strong (own kernel) | Good (shared kernel) |

## What it is made of

Five pieces. Knowing which one you are dealing with removes most Docker
confusion.

| Piece | What it is | Think of it as |
|:---|:---|:---|
| **Dockerfile** | A text file of build instructions | The recipe |
| **Image** | The built, read-only result | A frozen snapshot |
| **Container** | A running instance of an image | The live process |
| **Registry** | A server storing images (Docker Hub, ECR, ACR) | The app store |
| **Volume** | Storage that outlives the container | The external hard drive |

:::key
**Image versus container is the distinction that matters most.** An image is a
file — inert, read-only, shareable. A container is a *running process* started
from that image.

One image can start a hundred containers. Delete a container and the image is
untouched. Anything a container writes is lost when it is removed, unless it
was written to a volume.
:::

Behind the scenes there is also the **Docker daemon** (`dockerd`), the
background service that does the actual work, and the **CLI** (`docker`), which
just sends it instructions. When you see "Cannot connect to the Docker daemon",
the service is not running — your command was fine.

## How to use it

### 1. Run something that already exists

You do not need a Dockerfile to start. Pull a published image and run it:

```sh title="Run nginx and reach it on localhost:8080"
# -d          run in the background (detached)
# -p 8080:80  map port 8080 on your machine to port 80 in the container
# --name      give it a name, so you don't have to use the random ID
docker run -d -p 8080:80 --name web nginx

# Confirm it is running, then open http://localhost:8080
docker ps
```

The `-p` flag is the one people get backwards. It is always
**`host:container`** — outside first, inside second.

### 2. Package your own app

Create a file called `Dockerfile` next to your code:

```dockerfile title="Dockerfile — a small Node app"
# Start from an existing image instead of building from nothing.
# "alpine" variants are much smaller; "22" pins the major version.
FROM node:22-alpine

# Everything after this runs inside /app in the image.
WORKDIR /app

# Copy the dependency manifest FIRST, on its own. This is the single most
# valuable line in the file — see the caching note below.
COPY package*.json ./
RUN npm ci --omit=dev

# Now copy the rest of the source.
COPY . .

# Documents which port the app listens on. Does not publish it by itself.
EXPOSE 3000

# The command that runs when a container starts. Use this array form, not a
# plain string, so your app receives shutdown signals properly.
CMD ["node", "server.js"]
```

Then build and run it:

```sh title="Build, then run"
# -t gives the image a name and tag. Without it you get an untagged image
# that is awkward to refer to later.
docker build -t my-app:1.0 .

docker run -d -p 3000:3000 --name my-app my-app:1.0
```

:::tip Why `COPY package*.json` comes before `COPY . .`
Docker caches each instruction as a layer. If a layer's inputs have not
changed, it is reused instead of re-run.

Dependencies change rarely; your source changes constantly. By copying the
manifest and installing dependencies **first**, the slow `npm ci` step stays
cached across every source-only edit.

Reverse those lines and every one-character code change re-installs every
dependency. This one ordering decision is often the difference between a
5-second and a 3-minute build.
:::

### 3. The commands you will actually use daily

```sh
docker ps                  # running containers
docker ps -a               # including stopped ones — where exited containers hide
docker images              # images on this machine
docker logs -f my-app      # follow the output. First stop for "why did it break?"
docker exec -it my-app sh  # get a shell INSIDE a running container
docker stop my-app         # graceful stop
docker rm my-app           # delete the (stopped) container
docker rmi my-app:1.0      # delete the image
docker system prune -a     # reclaim disk. Deletes unused images — read the prompt
```

`docker logs` and `docker exec` are where you will spend most of your
debugging time. `docker logs` shows what the app printed; `docker exec` puts
you inside the container to look around.

### 4. Several containers at once: Compose

An app usually needs a database too. Writing three `docker run` commands with
the right flags in the right order gets old immediately. Compose puts it in
one file:

```yaml title="compose.yaml — app plus database"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    # Without this volume, your data is deleted with the container.
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```sh
docker compose up -d      # start everything
docker compose logs -f    # follow all services' logs together
docker compose down       # stop and remove (volumes survive)
```

Note `postgres://user:pass@db:5432` — the hostname is `db`, the *service name*.
Compose puts the services on one network where each is reachable by its name.
You never need to know their IP addresses.

## How it works underneath

A container is not a small virtual machine. It is an **ordinary Linux process**
with two kernel features applied to it:

```diagram
        ┌──────────────────────────────────────────┐
        │  your app  (just a process on the host)  │
        └──────────────────────────────────────────┘
             │                          │
    ┌────────↓─────────┐      ┌─────────↓──────────┐
    │   NAMESPACES     │      │      CGROUPS       │
    │ what it can SEE  │      │ what it can USE    │
    ├──────────────────┤      ├────────────────────┤
    │ own process list │      │ CPU limit          │
    │ own network/IP   │      │ memory limit       │
    │ own filesystem   │      │ I/O limit          │
    │ own hostname     │      │                    │
    └──────────────────┘      └────────────────────┘
                    │
        ┌───────────↓────────────┐
        │  SHARED HOST KERNEL    │ ← the whole trade-off
        └────────────────────────┘
```

Run `ps aux` on the host and you will see your containerised process listed
like any other. That is the entire trick: the process is real, but its *view*
of the system is restricted.

This also explains the limits. Containers cannot run a different kernel, which
is why Linux containers on Windows or macOS run inside a hidden Linux VM. And
because the kernel is shared, containers are a good isolation boundary but a
weaker security boundary than a VM.

## What goes wrong

| Symptom | Usual cause | Fix |
|:---|:---|:---|
| `Cannot connect to the Docker daemon` | Docker service not running | Start Docker Desktop / `sudo systemctl start docker` |
| Container exits immediately | The main process finished | `docker logs`. A container lives only as long as its main process |
| `port is already allocated` | Something else has that host port | Change the left side of `-p`, or stop the other container |
| Changes to code not appearing | You rebuilt nothing, or ran the old image | `docker build` again; check the tag you ran |
| Data disappeared after restart | Written to the container filesystem, not a volume | Mount a volume |
| Image is enormous (1GB+) | Build tools left in the final image | Use a multi-stage build and an `alpine` or `slim` base |
| Disk full | Old images and build cache accumulate | `docker system prune -a` |

:::danger Your data is deleted by default
Anything a container writes goes to a temporary layer that is destroyed with
the container. `docker rm` on a database container with no volume deletes the
database.

This surprises people because it works fine until the first restart. Any
container that holds data you care about needs a volume:

```sh
# -v <volume-name>:<path-inside-container>
docker run -d -v pgdata:/var/lib/postgresql/data postgres:17
```
:::

:::warn `latest` does not mean newest
`nginx:latest` is just a tag someone chose to move. It is not resolved
dynamically, and it can point at a different build tomorrow than it does today.

Using it means two builds of the same Dockerfile can produce different images —
which makes "works on my machine" possible again, this time inside Docker. Pin a
real version: `nginx:1.27-alpine`.
:::

## Two habits worth forming early

**Multi-stage builds.** Compile with a big toolchain, then copy only the result
into a small final image:

```dockerfile title="Build tools stay out of the shipped image"
# Stage 1 — has the full toolchain
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — only the built output and runtime dependencies
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

Nothing from stage 1 exists in the final image. It is routinely a 10× size
reduction, and it removes compilers from your production image.

**A `.dockerignore` file.** Without it, `COPY . .` sends your entire directory —
including `node_modules`, `.git` and any local secrets — into the build:

```text title=".dockerignore"
node_modules
.git
.env
*.log
dist
```

:::note Anything ever in an image layer stays in the image
Adding a secret in one layer and deleting it in the next does **not** remove
it. The earlier layer is still there and anyone with the image can extract it.

Never `COPY` a credential. Pass secrets as environment variables at run time,
or use build-time secret mounts.
:::

## Key takeaways

- **Dockerfile → image → container.** Recipe, snapshot, running process.
- **`-p host:container`** — outside first. This is the most-reversed flag.
- **Copy dependency manifests before source code.** It keeps the slow install
  step cached and is the biggest single build-speed win.
- **No volume means no data.** Container filesystems are temporary by design.
- **Pin versions.** `latest` is a moving label, not a version.
- A container is a **process with a restricted view**, not a small VM — which is
  why it starts instantly and why it shares your kernel.
