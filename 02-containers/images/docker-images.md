---
title: Docker Images and Registries
slug: docker-images
type: guide
domain: 02-containers
tags: [docker, images, registry, layers]
keywords: [layer, tag, digest, multi-stage, alpine, distroless, dockerfile,
           cache, push, pull, scan, buildkit, musl, glibc, sbom, rate limit,
           طبقات, صورة, ريجستري, تاج]
level: 2
status: stable
prerequisites: [docker]
related: [ci-cd, kubernetes-basics, devops-interview-questions]
updated: 2026-09-08
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

:::ar بالمصري · الـ image مش ملف واحد، دي **طبقات**
دي الحقيقة الوحيدة اللي لو فهمتها، تلات حاجات بيتفسّروا فوراً: الكاش،
والحجم، وليه السيكرت اللي مسحته لسه موجود.

**كل سطر في الـ Dockerfile بيطلّع طبقة**، والطبقة بتسجّل **التغييرات اللي
حصلت في الملفات** بسبب السطر ده.

```diagram
   Dockerfile                 الطبقات اللي بتطلع
   ──────────                 ──────────────────
   FROM node:22-alpine   →    [ نظام + node          ]  ← مشتركة مع صور تانية
   WORKDIR /app          →    [ (بيانات بس)          ]
   COPY package*.json ./ →    [ + package.json       ]
   RUN npm ci            →    [ + node_modules       ]  ← الكبيرة البطيئة
   COPY . .              →    [ + الكود بتاعك        ]
   CMD [...]             →    [ (بيانات بس)          ]

   والكونتينر بيضيف طبقة رفيعة واحدة **قابلة للكتابة** فوقهم كلهم
```

**وفايدتين وفخ واحد:**

**١. الكاش.** لو السطر ومدخلاته ما اتغيروش، دوكر بيستخدم الطبقة الجاهزة
بدل إنه ينفّذ تاني. **وعشان كده ترتيب السطور بيفرق جداً.**

**٢. المشاركة.** عشر صور مبنيين `FROM node:22-alpine` بيخزّنوا الأساس ده
**مرة واحدة** على الديسك. ولما تنزّل العاشرة، بتنزّل الطبقات الخاصة بيها بس.

**٣. الفخ:** الطبقات **بتتراكم فوق بعضها وبس** (append-only). ملف تضيفه
في طبقة وتمسحه في طبقة بعديها، **لسه موجود في الطبقة الأولى**، وأي حد
معاه الصورة يقدر يطلّعه.

**تخيلها كده:** الطبقات زي ورق شفاف بتحطه فوق بعضه. لما تمسح ملف، إنت
مش بتشيله — إنت بتحط ورقة جديدة مكتوب عليها «الملف ده مش موجود». والورقة
اللي تحت **لسه مكتوب فيها الملف كله**.
:::

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

:::ar
الفكرة بسيطة جداً: **ابني في مطبخ فيه كل العُدة، وشيل الطبق بس.**

```diagram
   Stage 1 — "build"                  Stage 2 — "runtime"
   ─────────────────                  ───────────────────
   FROM node:22        ١.١ جيجا       FROM node:22-alpine   ١٥٠ ميجا
   كومبايلر ✔                          كومبايلر ✘
   dev dependencies ✔                  dev dependencies ✘
   كاش البناء ✔                        كاش البناء ✘
   الكود المصدري ✔                     الكود المصدري ✘
   الناتج المبني ✔ ───┐
                       │
                       │  COPY --from=build
                       └──────────────────→   الناتج المبني ✔  وبس
```

**والفايدة مش الحجم بس** — ودي حاجة كتير مش واخدة بالها منها:

| الفايدة | يعني إيه |
|:---|:---|
| الحجم | من ٥ لـ ١٠ مرات أصغر. ديبلوي أسرع، فلوس أقل |
| **الأمن** | **مفيش كومبايلر في البرودكشن** |
| الثغرات | كل حزمة مش موجودة = ثغرة مش موجودة |

نقطة الأمن دي هي الأهم فعلاً. لو حد نجح يدخل الكونتينر بتاعك، هو محتاج
أدوات: كومبايلر، `curl`، `git`، شِل. الـ multi-stage بتشيل الأدوات دي كلها،
فهو بيلاقي نفسه في صندوق فاضي.

**ولو عايز تروح لأقصى حد:** استخدم `distroless` — صورة مفيهاش شِل خالص.
مفيش `sh`، مفيش `bash`، مفيش أي حاجة غير برنامجك و الـ runtime بتاعه.
(بس خد بالك: الـ debugging بيبقى أصعب، وبتحتاج `kubectl debug` عشان تبص جوه.)
:::

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

:::ar بالمصري · `latest` **مش** معناها الأحدث
دي أشهر لخبطة في دوكر كله، وسؤال انترفيو متكرر.

`latest` **مجرد استيكر**، حد بيلزقه بإيده على أي صورة. مفيش أي حاجة في
دوكر بتحسب «مين الأحدث» — الكلمة نفسها مضلّلة.

| الإشارة | ثابتة؟ |
|:---|:---|
| `myapp:latest` | **لأ** — استيكر أي حد يقدر ينقله |
| `myapp:1.4.2` | بالعُرف بس. **ممكن حد يكتب فوقه** |
| `myapp@sha256:abc123...` | **أيوه** — ده hash للمحتوى نفسه |

:::danger وليه دي كارثة في البرودكشن؟
عشان **ديبلويين لنفس الاسم بفارق أسبوع ممكن يشغّلوا كودين مختلفين تماماً**.

يعني إنت رجّعت مشكلة «شغّال على جهازي» من تاني، بس المرة دي **من جوه دوكر**.

وفي كوبرنيتيس الحكاية أسوأ. لو حاطط `latest` مع `imagePullPolicy: Always`:

```diagram
   Pod 1  قام الساعة ٩ صباحاً   →  نزّل latest  →  الكود A
   Pod 2  قام الساعة ٢ ظهراً    →  نزّل latest  →  الكود B  (حد عمل push)
   Pod 3  قام الساعة ٦ مساءً    →  نزّل latest  →  الكود B

   نفس الـ Deployment، نفس الـ YAML، **تلات بودات بكودين مختلفين**
   والترافيك بيتوزّع عليهم كلهم.
```

وده بيعمل bugs مستحيل تلاقيها: نفس الريكوست بينجح مرة ويفشل مرة، على حسب
البود اللي رد.

**والعُرف الصح في الـ CI:**

```sh
# التاج بالـ commit SHA — ثابت وبيقولك الكود بالظبط
docker build -t myapp:$GIT_SHA .
docker push myapp:$GIT_SHA

# ولو البشر محتاجين اسم سهل، حرّك استيكر كمان — بس متنشرهوش
docker tag myapp:$GIT_SHA myapp:stable
```

يعني: **انشر تاج ثابت، وسيب الاستيكرات المتحركة للبشر بس.**
:::
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

:::ar بالمصري · السيكرت اللي دخل طبقة، دخل للأبد
```dockerfile
COPY .env /app/.env       ← طبقة ١: الملف اتحفظ هنا
RUN rm /app/.env          ← طبقة ٢: علامة "مش موجود" بس
```

**إنت ما مسحتش حاجة.** الطبقة الأولى لسه فيها الملف كامل، و `docker history`
بتوريه، وأي حد يقدر يطلّعه من أرشيف الطبقة.

**الطريقتين الصح:**

**١. وقت التشغيل** — environment variables أو ملفات مركّبة. ده الطبيعي
والمعتاد.

**٢. وقت البناء** (لو مضطر تستخدم سيكرت عشان تنصّب حاجة خاصة) —
BuildKit secret mounts، ودي **عمرها ما بتتحفظ في أي طبقة**:

```dockerfile
RUN --mount=type=secret,id=npmrc \
    npm ci --userconfig=/run/secrets/npmrc
```
```sh
docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
```

الـ secret هنا بيبقى موجود **بس أثناء تنفيذ السطر ده**، وبعدها بيختفي
ومفيش أي أثر ليه في الصورة.

:::danger ولو السيكرت اتنشر خلاص؟ **غيّره. مفيش حل تاني.**
دي نقطة الناس بتقاوم فيها، فخد بالك.

إنك تعيد بناء الصورة أو تمسحها من الـ registry **مش بيحل حاجة**، عشان:

- ممكن حد نزّلها خلاص
- ممكن تكون في كاش نودات، أو في mirror، أو في باك أب
- ممكن تكون في لوجز الـ CI

**السيكرت اللي خرج من إيدك، خرج.** الحل الوحيد إنك **تعمله rotate** —
تولّد واحد جديد وتبطّل القديم.

ودي بالمناسبة إجابة سؤال انترفيو شائع: «لقينا مفتاح في صورة على الـ registry،
نعمل إيه؟» — اللي بيقول «نمسح الصورة» بيرسب. اللي بيقول
«**نبطّل المفتاح الأول**، وبعدين نظبّط البناء، وبعدين نشوف اتسرّب لفين»
بينجح.
:::
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

:::ar
جدول سريع لأشهر المشاكل:

| العَرَض | السبب | الحل |
|:---|:---|:---|
| كل بناء بطيء | `COPY . .` قبل تنصيب الـ dependencies | رتّب تاني |
| الصورة ١.٥ جيجا | أدوات البناء في الصورة النهائية | multi-stage + base أصغر |
| **`exec format error`** | **معمارية معالج غلط** (arm64 مقابل amd64) | `docker build --platform linux/amd64` |
| `no such file` وبرنامج موجود قصادك | musl مقابل glibc على alpine | استخدم `-slim` |
| عدّلت الكود ومش بيبان | شغّال الصورة القديمة، أو طبقة من الكاش | شيك التاج، وجرّب `--no-cache` |
| `toomanyrequests` في الـ CI | حد Docker Hub للمجهولين | اعمل login، أو mirror |
| بودات مختلفة بكود مختلف | نشرت `latest` | انشر تاج ثابت |

**والاتنين اللي بيضيّعوا أطول وقت:**

**`exec format error`** — دي معناها **معمارية**، مش صلاحيات ولا ملف ناقص.
بتحصل كتير أوي لو إنت على ماك M1/M2/M3 وبتبني صورة وبتنشرها على سيرفر
`amd64`. الحل:

```sh
docker build --platform linux/amd64 -t myapp .
```

**و `no such file or directory` على برنامج إنت شايفه بعينك** — دي كلاسيكية
alpine. البرنامج موجود فعلاً، بس هو مبني على `glibc` و alpine بتستخدم `musl`،
فالمكتبة اللي بيدوّر عليها مش موجودة، ولينكس بيقول «not found» عن **المكتبة**
مش عن البرنامج. الحل الأسرع: `-slim` بدل `-alpine`.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Explain Docker layer caching, and how you would order a Dockerfile for a monorepo.
Each instruction produces a layer keyed on the instruction plus its inputs.
If the key is unchanged the layer is reused — **but invalidating one layer
invalidates every layer after it**, whether or not those would have changed.

So the rule is: **order least-likely-to-change first.**

For a monorepo the naive `COPY . .` is fatal, because a change to *any*
package invalidates the install for *every* package:

```dockerfile
# Copy only the manifests first — one COPY per package, or a glob that
# matches manifests only. A change in service B's source no longer
# invalidates service A's dependency install.
COPY package.json pnpm-lock.yaml ./
COPY packages/a/package.json packages/a/
COPY packages/b/package.json packages/b/
RUN pnpm install --frozen-lockfile

# Only now bring in source
COPY . .
RUN pnpm --filter a build
```

:::key The senior addition
Mention **cache mounts** and a **registry-backed cache**, because in CI the
local layer cache is empty on every run:

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm ci
```
```sh
docker buildx build --cache-from=type=registry,ref=myapp:cache \
                    --cache-to=type=registry,ref=myapp:cache,mode=max .
```
Without one of these, "we optimised our Dockerfile" makes no difference to
CI at all — which is the point most candidates miss.
:::

:::ar
كل سطر بيطلّع طبقة، ومفتاح الطبقة = السطر + مدخلاته. لو المفتاح ما اتغيرش،
الطبقة بتتعاد استخدامها — **بس أول طبقة تتلغي، كل اللي بعديها بيتلغي**،
سواء هما اتغيروا ولا لأ.

**فالقاعدة: رتّب من الأقل تغيّراً للأكتر تغيّراً.**

**وفي المونوريبو**، الـ `COPY . .` الساذجة **قاتلة**: تغيير في أي حزمة
بيلغي تنصيب **كل** الحزم.

الصح إنك تنقل **ملفات الـ manifest بس الأول**، كل حزمة لوحدها، وبعدين
تنصّب، وبعدين تجيب الكود.

**والإضافة اللي بتبيّن إنك سينيور:** إنك تتكلم عن **cache mounts**
و **كاش على الـ registry** — عشان في الـ CI **الكاش المحلي فاضي كل مرة**:

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm ci
```
```sh
docker buildx build --cache-from=type=registry,ref=myapp:cache \
                    --cache-to=type=registry,ref=myapp:cache,mode=max .
```

**ومن غير واحدة من دي، كل ترتيبك للـ Dockerfile مش هيفرق حاجة في الـ CI
خالص** — وهي دي النقطة اللي أغلب الناس بتفوّتها.
:::
:::

:::q Alpine or Debian slim for production? · نستخدم alpine ولا slim؟
The expected answer is a trade-off, not a winner.

| | `alpine` | `-slim` (Debian) |
|:---|:---|:---|
| Size | ~150 MB | ~250 MB |
| libc | **musl** | glibc |
| Native modules | Sometimes break | Work |
| DNS resolution | musl historically weaker (no `search` fallback for some cases) | Standard glibc behaviour |
| Package availability | `apk`, smaller ecosystem | `apt`, everything |

**When alpine is right:** Go or Rust static binaries (where libc barely
matters), simple interpreted apps, and anywhere image size genuinely
dominates — huge fleets, tight bandwidth.

**When to use slim:** anything with native modules (Python wheels with C
extensions, `node-gyp` builds), anything latency-sensitive to DNS, and any
time you find yourself debugging musl for more than half an hour.

:::warn The failure mode to name
`Error loading shared library` or `no such file or directory` on a binary
you can plainly see with `ls`. The file exists; the **dynamic linker** it
asks for does not. That message is one of the most misleading in Linux, and
recognising it as a musl/glibc mismatch rather than a missing file is the
mark of experience.
:::

:::ar
الإجابة المتوقعة **مقايضة، مش فايز**.

| | `alpine` | `-slim` |
|:---|:---|:---|
| الحجم | ١٥٠ ميجا | ٢٥٠ ميجا |
| مكتبة libc | **musl** | glibc |
| مكتبات native | ساعات بتضرب | شغالة |
| الـ DNS | musl تاريخياً أضعف | سلوك glibc القياسي |
| الحزم المتاحة | `apk`، أقل | `apt`، كل حاجة |

**alpine صح لما:** برامج Go أو Rust مبنية static (فـ libc مش فارقة أصلاً)،
تطبيقات بسيطة، وأي مكان حجم الصورة فيه بيفرق فعلاً (أسطول ضخم، أو نت ضعيف).

**استخدم slim لما:** فيه مكتبات native (حزم بايثون فيها كود C، أو `node-gyp`)،
أو التطبيق حساس لسرعة الـ DNS، **أو أول ما تلاقي نفسك قاعد أكتر من نص ساعة
بتظبّط مشكلة musl**.

**والعَرَض اللي لازم تسمّيه بالاسم:**

`no such file or directory` على برنامج إنت شايفه بعينك في `ls`.

الملف **موجود**. اللي مش موجود هو **الـ dynamic linker** اللي البرنامج
بيطلبه. والرسالة دي من أكتر الرسايل المضلّلة في لينكس.

وإنك تعرفها على إنها **عدم توافق musl/glibc** مش «ملف ناقص» — دي علامة
الخبرة في السؤال ده.
:::
:::

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

:::ar بالمصري · الخلاصة
1. **الصورة طبقات بتتراكم وبس.** مفيش حاجة بتتشال فعلاً منها.
2. **رتّب الـ Dockerfile: الأقل تغيّراً فوق.** الـ dependencies قبل الكود.
3. **الـ multi-stage** بتشيل الكومبايلر من البرودكشن — وعادةً بتصغّر
   ٥ لـ ١٠ مرات. والفايدة الأمنية أكبر من فايدة الحجم.
4. **`.dockerignore`** بيسرّع البناء وبيمنع `.git` و `.env` إنهم يدخلوا.
5. **عمرك ما تنشر `latest`.** انشر تاج ثابت — الـ commit SHA أحسن حاجة.
6. **السيكرت اللي دخل طبقة موجود للأبد.** استخدم BuildKit secret mounts،
   ولو اتسرّب **اعمله rotate** — مسح الصورة مش بيحل حاجة.
7. **`docker history`** بتوريك الطبقة اللي كبّرت الصورة.
8. **حُط `USER`** — متشغّلش كـ root.
9. **`exec format error` = معمارية غلط.** استخدم `--platform linux/amd64`.
:::
