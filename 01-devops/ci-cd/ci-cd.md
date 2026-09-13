---
title: CI/CD
slug: ci-cd
type: guide
domain: 01-devops
tags: [ci-cd, automation, pipelines]
keywords: [continuous integration, continuous delivery, pipeline,
           github actions, build, test, deploy, artifact, rollback, canary,
           blue green, oidc, flaky tests, migrations, concurrency,
           بايبلاين, نشر, اختبارات, أتمتة]
level: 2
status: stable
prerequisites: [git, docker]
related: [docker-images, terraform, jenkins, gitops, helm,
          devops-interview-questions]
updated: 2026-09-08
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

:::ar
الاختصارات دي بتتقال مع بعض على طول، والناس بتخلط بينهم. **وهما تلاتة
حاجات مش اتنين.**

| | معناه | بيجاوب على سؤال إيه |
|:---|:---|:---|
| **CI** | Continuous **Integration** | «الكود لسه بيبني وبينجح في التستات؟» |
| **CD** | Continuous **Delivery** | «كل نسخة ناجحة **جاهزة** للنشر؟» (وبني آدم بيدوس) |
| **CD** | Continuous **Deployment** | «كل نسخة ناجحة **بتتنشر** لوحدها فوراً» |

شوف الـ CD مرتين؟ **دي فعلاً كلمتين مختلفتين بنفس الاختصار**، والفرق
بينهم **مين بيدوس الزرار**:

```diagram
   Continuous Delivery                Continuous Deployment
   ───────────────────                ─────────────────────
   push → بناء → تست → جاهز           push → بناء → تست → **نشر**
                        │
                        ↓
                  ⏸ مستني بني آدم
                        │
                        ↓
                      نشر
```

**وأغلب الفرق عايزة الـ Delivery** — يعني كل حاجة أوتوماتيك لحد باب
البرودكشن، وقرار الدخول بيبقى قرار واعي.

:::key وليه البايبلاين موجودة من الأصل؟
الناس بتفتكر إن الفايدة هي **السرعة**. وهي مش السرعة.

الفايدة إن العملية **مكتوبة، ومتكررة، وواحدة بالظبط كل مرة**.

```diagram
   النشر بالإيد                       بايبلاين
   ─────────────                       ────────
   خطوة تتنسى                          نفس الخطوات كل مرة
   شغّال على جهاز واحد بس              شغّال في بيئة نضيفة
   محدش فاكر اتنشر إيه بالظبط          مكتوب بالتاريخ والـ commit
   الرجوع = تفتكر وتعيد بإيدك          الرجوع = أمر واحد
```

**والجملة اللي تفتكرها:** نفس الخطوات بتتنفّذ بنفس الترتيب، **سواء إنت
مرتاح يوم التلات، أو مرعوب يوم الخميس الساعة ١١ بالليل.**

ودي هي القيمة الحقيقية. السرعة مكسب إضافي.
:::
:::

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
      ↓
   ① BUILD      compile, build the image        fail fast, cheapest first
      │
      ↓
   ② TEST       unit → integration → lint
      │
      ↓
   ③ PACKAGE    tag the artifact with the Git SHA
      │
      ↓
   ④ PUBLISH    push to a registry
      │
      ↓
   ⑤ DEPLOY staging     automatic
      │
      ↓
   ⑥ VERIFY     smoke tests against staging
      │
      ↓
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

:::ar **ابني مرة واحدة، ورقّي نفس الحاجة**
دي أهم قاعدة في البايبلاين كلها، وأشهر غلطة معمارية في نفس الوقت.

**الغلط:**

```diagram
   الكود ──→ ابني ──→ انشر على staging      (صورة رقم ١)
   الكود ──→ ابني ──→ انشر على production   (صورة رقم ٢)
```

شكلها بريئة، **وهي كارثة**.

**ليه؟** عشان البناء التاني **مش مضمون يطلّع نفس البايتات**:

- الـ base image ممكن تكون اتحدّثت في الوقت اللي بين البنايتين
- مكتبة من مكتبات المكتبات (transitive dependency) طلعت نسخة جديدة
- الـ timestamps والـ hashes مختلفة

**والنتيجة:** إنت اختبرت على **staging** حاجة، وشغّلت في **البرودكشن**
حاجة تانية. **فكل اختبارك مبقى بيثبت أي حاجة عن البرودكشن.**

**والصح:**

```diagram
   الكود ──→ ابني **مرة واحدة** ──→ صورة واحدة بتاج = commit SHA
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ↓                     ↓                     ↓
                 staging                  QA               production
              (نفس الصورة)           (نفس الصورة)         (نفس الصورة)
```

**والإعدادات هي اللي بتتغير بين البيئات، مش الـ artifact.**

يعني الصورة واحدة، والـ `DATABASE_URL` وباقي المتغيرات هي اللي مختلفة —
وبتيجي من ConfigMaps أو Secrets، مش من بناء جديد.

**وده معناه:** لما تختبر على staging وتنجح، إنت **فعلاً** اختبرت البايتات
اللي هتشتغل في البرودكشن. وده الغرض كله.
:::

## The tool landscape

Every tool here runs the same shape — trigger, stages, artefact, deploy. They
differ in **who operates them** and **which direction the deploy goes**.

```diagram
   CI TOOLS  (build and test)          CD TOOLS  (get it running)
   ─────────────────────────           ──────────────────────────
   GitHub Actions                      Argo CD      ┐
   GitLab CI                           Flux         ├ PULL: agent in the
   Jenkins                                          ┘ cluster reads Git
   CircleCI · Buildkite
   Azure Pipelines                     the CI tool itself  ┐ PUSH: pipeline
   Tekton                              Spinnaker           ┘ holds cluster
                                                             credentials
   Many tools do both. The PUSH/PULL split is the decision that matters.
```

| Tool | Hosted by | Config | Strongest when | Watch out for |
|:---|:---|:---|:---|:---|
| **GitHub Actions** | GitHub | `.github/workflows/` | You are already on GitHub | Third-party actions are a supply-chain risk — pin to SHAs |
| **GitLab CI** | GitLab or you | `.gitlab-ci.yml` | You are on GitLab; it is deeply integrated | Ties you to GitLab |
| **[Jenkins](jenkins.md)** | **You** | `Jenkinsfile` | Self-hosting is required; huge plugin ecosystem | You operate it — plugins, disk, CVEs |
| **CircleCI / Buildkite** | Them (Buildkite: your agents) | YAML | Fast, good caching; Buildkite keeps code on your infra | Per-minute cost |
| **Azure Pipelines** | Microsoft | YAML | Azure and enterprise Windows estates | Azure-centric |
| **Tekton** | You, on Kubernetes | CRDs | You want CI *as* Kubernetes objects | Low-level; usually needs a UI on top |
| **[Argo CD](gitops.md) / Flux** | In your cluster | Git repo | Kubernetes CD done properly | CD only — you still need CI |

:::key Choose on constraints, not preference
Three questions settle it almost every time:

1. **Where does your code live?** Being on GitHub or GitLab makes their CI the
   default; the integration is most of the value.
2. **Must you self-host?** Regulatory, air-gapped, or data-residency reasons
   point to Jenkins, GitLab self-managed, or Tekton.
3. **Are you deploying to Kubernetes?** Then the CD half should probably be
   **pull-based** — Argo CD or Flux — regardless of which CI you picked.

The common, boring, correct answer for a new project on GitHub deploying to
Kubernetes is: **Actions for CI, Argo CD for CD.** Do not run CI you could rent
without a reason you can state.
:::

:::ar منظر الأدوات — إيه الفرق بينهم؟
**كل الأدوات دي بتعمل نفس الشكل**: زناد ← مراحل ← artifact ← نشر.

**والفرق بينهم في حاجتين بس:**

1. **مين بيشغّلهم** (إنت ولا شركة)
2. **الديبلوي رايح في أي اتجاه** (دفع ولا سحب)

| الأداة | مين بيستضيفها | قوّتها | خد بالك من |
|:---|:---|:---|:---|
| **GitHub Actions** | GitHub | إنت أصلاً على GitHub | **actions الغير خطر سلسلة توريد** — ثبّتها على SHA |
| **GitLab CI** | GitLab أو إنت | تكامل عميق | بتربطك بـ GitLab |
| **[Jenkins](jenkins.md)** | **إنت** | لما تكون **مضطر** تستضيف | **إنت بتشغّله** — plugins وديسك وثغرات |
| **CircleCI / Buildkite** | هما | سريعة وكاش كويس | التكلفة بالدقيقة |
| **Tekton** | إنت، على كوبرنيتيس | CI **كأوبجكتس كوبرنيتيس** | منخفض المستوى |
| **[Argo CD](gitops.md) / Flux** | **جوه كلاسترك** | **نشر كوبرنيتيس صح** | **نشر بس** — لسه محتاج CI |

:::key والاختيار على أساس **القيود**، مش التفضيل
**تلات أسئلة بيحسموا الموضوع في أغلب الحالات:**

**١. كودك فين؟** لو على GitHub أو GitLab، الـ CI بتاعتهم هي الافتراضي —
**والتكامل هو أغلب الفايدة**.

**٢. هل إنت مضطر تستضيف بنفسك؟** (رقابة، شبكة مقفولة، قيود على مكان
الداتا) ← Jenkins أو GitLab ذاتي أو Tekton.

**٣. بتنشر على كوبرنيتيس؟** يبقى **نص الـ CD المفروض يبقى سحب (pull)**
— Argo CD أو Flux — **بغض النظر عن الـ CI اللي اخترتها**.

**والإجابة الشائعة والمملّة والصحيحة** لمشروع جديد على GitHub بينشر على
كوبرنيتيس: **Actions للـ CI، و Argo CD للـ CD.**

**ومتشغّلش CI تقدر تستأجرها من غير سبب تقدر تقوله.**
:::
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

:::ar بايبلاين بتقول «نجح» والبرودكشن واقع
دي أخطر حاجة في الصفحة، عشان **البايبلاين اللي بتكدب أسوأ من إنك ملكش
بايبلاين خالص**.

**اللي بيحصل:**

```diagram
   kubectl set image deploy/web web=myapp:abc123
        │
        │  بيرجع **فوراً** بنجاح
        │  عشان هو بس سجّل "المطلوب" في etcd
        ↓
   البايبلاين تشوف exit code = 0
        │
        ↓
   ✅ أخضر! الديبلوي نجح!
        │
        └──→ وفي نفس اللحظة، البودات الجديدة في CrashLoopBackOff
             والموقع واقع، وإنت رايح تنام
```

**السبب:** `kubectl set image` **مش بينشر**. هو بس بيكتب المطلوب وبيمشي.
النشر الحقيقي بيحصل بعده بواسطة الكنترولرز.

**والحل سطر واحد:**

```sh
kubectl rollout status deploy/web --timeout=5m
```

ده **بيستنى** البودات تبقى `Ready`، **وبيرجع كود غير صفر لو ما بقتش**.
فالبايبلاين تفشل، وإنت تعرف.

**والقاعدة العامة أهم من الأمر نفسه:**

> **أي أداة نشر: استنى النتيجة واتأكد منها.**

مش مهم الأداة — Helm، أو ArgoCD، أو سكريبت بتاعك. لازم يكون فيه خطوة
بتشوف **النتيجة الحقيقية** مش بس **إن الأمر اتبعت**.

**وبعدها كمان:** حُط خطوة **verify** بتضرب على الـ health endpoint فعلاً
من بره:

```sh
curl -fsS https://api.example.com/health || exit 1
```

عشان «البودات Ready» و «الموقع بيشتغل» **حاجتين مختلفتين**.
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

:::ar الـ rolling update معناها **نُسختين شغالين مع بعض**
دي نقطة كل الناس بتنساها، ولحد ما توقّع الموقع في ديبلوي عادي جداً.

```diagram
   خلال الديبلوي — لدقايق
   ────────────────────────

   نسخة قديمة (v1)  ███░░░   لسه بتخدم ترافيك
   نسخة جديدة (v2)  ░░░███   وبتخدم ترافيك كمان
        │                 │
        └────────┬────────┘
                 ↓
        **نفس الداتابيز**
```

**والنتيجة قاعدتين مقدّستين:**

**١. الـ migrations لازم تبقى متوافقة للخلف.**

| آمن | خطر |
|:---|:---|
| تضيف عمود nullable | **تمسح عمود** |
| تضيف جدول | **تغيّر اسم عمود** |
| تضيف index | **تضيّق نوع عمود** |

ليه؟ عشان لو مسحت عمود، **النسخة القديمة اللي لسه شغالة بتضرب فوراً**
عشان هي لسه بتسأل عن العمود ده.

**والحل: التغيير على مرحلتين (أو تلاتة).** عايز تغيّر اسم عمود من
`name` لـ `full_name`؟

```diagram
   ديبلوي ١:  ضيف full_name  +  الكود يكتب في الاتنين ويقرأ من name
   ديبلوي ٢:  الكود يقرأ من full_name  (والاتنين لسه موجودين)
   ديبلوي ٣:  الكود يبطّل يكتب في name
   ديبلوي ٤:  امسح العمود name
```

طويلة؟ أيوه. **بس مفيش انقطاع.** والبديل إنك توقّف الخدمة، وده تنازل
تاخده بوعي مش بالغلط.

**٢. الـ APIs لازم تتحمّل النسختين.** نفس المنطق: انشر كود بيقبل الشكل
القديم والجديد الأول، وبعدين حوّل اللي بيبعت، وبعدين شيل الطريق القديم.
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

:::ar
**البايبلاين الكويسة أربع صفات:**

```diagram
   FAST        أقل من ١٠ دقايق، وإلا الناس بتبطّل تستناها
   RELIABLE    الأحمر معناه كود باظ، **عمره ما يبقى تخبّط**
   REVERSIBLE  الرجوع أمر واحد، **وإنت جرّبته قبل كده**
   VISIBLE     اللوج بيقول **إيه** اللي فشل، مش بس إن فيه حاجة فشلت
```

:::danger والتستات المتخبّطة (flaky) بتقتل قيمة البايبلاين كلها
دي أخطر حاجة على الفريق، وأغلب الناس مش شايفة خطورتها.

**تست واحد بيفشل ٥٪ من المرات** بيعلّم الفريق كله حاجة واحدة:
**«لو أحمر، اعمل re-run».**

```diagram
   تست متخبّط واحد
        ↓
   الناس بتعمل re-run من غير ما تقرأ
        ↓
   بيبقى عُرف: "الأحمر مش معناه حاجة"
        ↓
   يوم يجي فشل **حقيقي**
        ↓
   حد يعمل re-run... ويعمل re-run... وبعدين يمرّره
        ↓
   الباج يوصل البرودكشن
```

**والتست المتخبّط أسوأ من إنه مش موجود خالص.** التست الناقص بيخليك
مش عارف. التست المتخبّط بيعلّمك **تتجاهل** اللي إنت عارفه.

**فصلّحه أو امسحه.** إنك تسيبه هو **الاختيار الوحيد اللي بيضرّك**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q A deploy needs a database migration that renames a column. Design it so there is no downtime.
The answer is that you **cannot rename it in one step** — during a rolling
update both versions are live against the same database, so the old code
would query a column that no longer exists.

You do it as an **expand / contract** sequence, over several deploys:

```diagram
   deploy 1   ADD full_name (nullable)
              code writes BOTH columns, reads `name`
                    │  old pods still work: `name` is intact
                    ↓
   deploy 2   code reads `full_name`, still writes both
                    │  backfill existing rows here
                    ↓
   deploy 3   code stops writing `name`
                    │  nothing reads it any more
                    ↓
   deploy 4   DROP `name`
```

Each step is independently safe and independently rollback-able, which is the
actual requirement.

| Safe in one step | Needs expand/contract |
|:---|:---|
| Add a nullable column | Rename a column |
| Add a table or index | Drop a column |
| Widen a type (`int` → `bigint`) | Narrow a type |
| Add a default | Add a `NOT NULL` without a default |

:::key What is really being tested
Whether you know that **the deploy and the schema are two independent
timelines**, and that a rolling update makes them overlap. A candidate who
answers "run the migration in an init container before the new version
starts" has missed that the *old* pods are still serving.
:::

:::ar
الإجابة إنك **مش تقدر تغيّر الاسم في خطوة واحدة**.

عشان خلال الـ rolling update **النسختين شغالين على نفس الداتابيز**، فالكود
القديم هيسأل عن عمود مش موجود، وهيضرب.

**الحل تسلسل اسمه expand/contract**، على كذا ديبلوي:

```diagram
   ديبلوي ١   ضيف full_name (nullable)
              الكود يكتب في **الاتنين**، ويقرأ من name
                    │  البودات القديمة شغالة عادي: name موجود
                    ↓
   ديبلوي ٢   الكود يقرأ من full_name، ولسه بيكتب في الاتنين
                    │  وهنا تنقل الداتا القديمة (backfill)
                    ↓
   ديبلوي ٣   الكود يبطّل يكتب في name
                    │  مفيش حد بيقرأ منه خلاص
                    ↓
   ديبلوي ٤   امسح name
```

**وكل خطوة آمنة لوحدها، وبينفع ترجع منها لوحدها** — وده هو المطلوب فعلاً.

| آمن في خطوة واحدة | محتاج expand/contract |
|:---|:---|
| تضيف عمود nullable | **تغيّر اسم عمود** |
| تضيف جدول أو index | **تمسح عمود** |
| توسّع نوع (`int` → `bigint`) | **تضيّق نوع** |
| تضيف قيمة افتراضية | تضيف `NOT NULL` من غير افتراضي |

**واللي بيتقاس عليه:** إنك عارف إن **الديبلوي والـ schema خطين زمنيين
مستقلين**، وإن الـ rolling update بيخليهم **يتقاطعوا**.

واللي بيجاوب «نشغّل الـ migration في init container قبل النسخة الجديدة»
**فوّت إن البودات القديمة لسه بتخدم** — وهي دي المشكلة كلها.
:::
:::

:::q Your CI has a step that deploys to production. Someone opens a pull request from a fork. What could go wrong?
**Secrets exposure and code execution with your credentials** — this is one
of the most exploited CI weaknesses.

Two specific dangers:

| Trigger | Danger |
|:---|:---|
| `pull_request_target` | Runs in the **base repo's** context, with secrets, but checks out untrusted code if you are careless |
| A workflow that checks out the PR head **and** has secrets | The PR author's code runs with your tokens |

An attacker opens a PR that adds one line to a build script, your pipeline
runs it with `secrets.AWS_ACCESS_KEY`, and it posts the key to their server.
The build even goes green.

**Defences, in order:**

```yaml
# 1. Least privilege by default, per workflow
permissions:
  contents: read        # not write, and no packages/id-token unless needed

# 2. Pin third-party actions to a commit SHA, not a moving tag.
#    A tag can be repointed at new code by whoever owns the action.
- uses: actions/checkout@8f4b7f8  # v4.1.1

# 3. Separate the pipelines: test on PRs (no secrets),
#    deploy only from a push to main.
on:
  pull_request:          # test job only
  push:
    branches: [main]     # the job with deploy credentials
```

Plus `environment:` protection rules with required reviewers, and OIDC
federation so there is no long-lived cloud key to steal at all.

:::key The sentence that lands it
"Untrusted code and production credentials must never be in the same job."
That is the principle; everything else is an implementation of it.
:::

:::ar
**تسريب الأسرار، وتشغيل كود غريب بصلاحياتك** — ودي من أكتر نقاط الضعف
اللي بتتستغل في الـ CI.

**السيناريو:**

```diagram
   حد بيفتح PR من fork
        │
        │  بيضيف سطر واحد في سكريبت البناء
        ↓
   البايبلاين بتاعتك بتشغّل السطر ده
        │
        │  ومعاها secrets.AWS_ACCESS_KEY
        ↓
   السطر بيبعت المفتاح لسيرفر الشخص ده
        │
        ↓
   ✅ البناء أخضر. ومحدش لاحظ حاجة.
```

**والدفاعات بالترتيب:**

```yaml
# ١. أقل صلاحيات ممكنة، لكل workflow
permissions:
  contents: read       # مش write، ومفيش packages أو id-token غير لو محتاجهم

# ٢. ثبّت الـ actions الخارجية على commit SHA مش على tag.
#    التاج ممكن صاحب الـ action يحرّكه على كود جديد في أي وقت.
- uses: actions/checkout@8f4b7f8   # v4.1.1

# ٣. **افصل البايبلاينز**: تست على الـ PRs (من غير أسرار)،
#    ونشر من الـ push على main بس.
on:
  pull_request:        # وظيفة التست بس
  push:
    branches: [main]   # الوظيفة اللي معاها صلاحيات النشر
```

وزود على كده قواعد الـ `environment:` بمراجعين إلزاميين، و **OIDC** عشان
ميبقاش فيه مفتاح كلاود طويل الأجل يتسرق من الأصل.

**والجملة اللي تحسم الإجابة:**

> **«كود مش موثوق، وصلاحيات برودكشن — ممنوع يكونوا في نفس الـ job.»**

ده هو المبدأ. وأي حاجة تانية مجرد تطبيق ليه.
:::
:::

:::q Deploys take 40 minutes. Make them under 10 without reducing safety.
Measure the stages first — then attack in the order the time actually is:

| Suspect | Typical fix | Typical saving |
|:---|:---|:---|
| Tests run serially | Shard across parallel runners | Often 50–70% |
| Dependencies re-downloaded | Cache keyed on the lockfile hash | Minutes per run |
| Docker layers rebuilt | Registry-backed layer cache, ordered Dockerfile | Minutes |
| Whole monorepo rebuilds | Build only changed packages from the dep graph | Large |
| Sequential deploy per environment | Promote the same artifact, do not rebuild | 1 build instead of 3 |
| Slow tests run first | Reorder cheapest-first, fail fast | Perceived, but real |

:::warn The trap in the question
They said **without reducing safety**. The tempting answer — "run tests in
parallel and skip the slow ones" — trades away the property they explicitly
asked you to keep.

Say out loud that you are not going to reduce coverage, then find the time
elsewhere. Candidates who quietly drop the integration suite have failed the
question, not answered it.
:::

:::ar
**قيس المراحل الأول**، وبعدين هات المشاكل بترتيب الوقت الحقيقي:

| المشتبه فيه | الحل | التوفير المعتاد |
|:---|:---|:---|
| التستات على التوالي | وزّعها على runners متوازية | غالباً ٥٠–٧٠٪ |
| الـ dependencies بتتنزّل كل مرة | كاش مفتاحه hash الـ lockfile | دقايق كل run |
| طبقات دوكر بتتبني من الأول | layer cache على الـ registry | دقايق |
| المونوريبو كله بيتبني | ابني المتغيّر بس من شجرة الاعتماديات | كبير |
| نشر لكل بيئة على التوالي | رقّي نفس الـ artifact | بناء واحد بدل ٣ |
| التستات البطيئة بتشتغل الأول | رتّب الأرخص الأول، افشل بسرعة | إحساس، بس حقيقي |

**والفخ في السؤال:**

هما قالوا **«من غير ما تقلّل الأمان»**.

والإجابة المغرية — «نشغّل التستات بالتوازي **ونشيل البطيئة**» — بتبيع
بالظبط الحاجة اللي هما طلبوا تحافظ عليها.

**فقول بصريح العبارة إنك مش هتقلّل التغطية**، وبعدها دوّر على الوقت في
حاجة تانية.

واللي بيشيل الـ integration tests في سكوت، **ده فشل في السؤال مش جاوبه.**
:::
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
- **Untrusted code and production credentials never share a job.**

:::ar الخلاصة
1. **CI = هو شغّال؟ CD = ينفع ينزل؟** مشكلتين مختلفتين، ومتخلطهمش.
2. **ابني مرة واحدة ورقّي نفس الـ artifact.** البناء لكل بيئة **بيلغي
   قيمة اختبارك كله**.
3. **التاج = الـ commit SHA.** ثابت، وبيوصّلك للكود بالظبط.
4. **استنى نتيجة الديبلوي واتأكد منها** — وإلا «الأخضر» مش معناه حاجة.
   والبايبلاين اللي بتكدب أسوأ من مفيش بايبلاين.
5. **الـ rolling update بيشغّل نسختين مع بعض**، فالـ migrations لازم
   تبقى متوافقة للخلف. تغيير اسم عمود = ٤ ديبلويات.
6. **صلّح أو امسح التستات المتخبّطة.** هي بتعلّم الفريق يتجاهل الأحمر.
7. **الرجوع للخلف لازم يبقى أمر واحد**، **ولازم تكون جرّبته** قبل الأزمة.
8. **كود مش موثوق + صلاحيات برودكشن = ممنوع في نفس الـ job.**
:::
