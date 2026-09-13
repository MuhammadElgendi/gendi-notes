---
title: GitOps
slug: gitops
type: concept
domain: 01-devops
tags: [gitops, cd, kubernetes, argocd]
keywords: [argo cd, flux, pull based, reconciliation, drift, sync, declarative,
           sealed secrets, external secrets, app of apps, progressive delivery,
           جيت أوبس, نشر, تزامن, انحراف]
level: 3
status: stable
prerequisites: [ci-cd, kubernetes-basics, git]
related: [ci-cd, jenkins, helm, kubernetes-architecture,
          devops-interview-questions]
updated: 2026-09-13
---

# GitOps

> The cluster pulls its desired state from Git instead of a pipeline pushing into the cluster — which turns "what is deployed?" from an investigation into a `git log`.

## What is it?

GitOps means:

1. The **entire** desired state of the system is declared in Git.
2. An **agent inside the cluster** continuously compares Git to reality and
   closes the gap.
3. Nothing else has write access to the cluster.

```diagram
   PUSH-BASED CD (traditional)        PULL-BASED CD (GitOps)
   ───────────────────────────        ──────────────────────
   git push
      │                                git push
      ↓                                   │
   CI pipeline                            ↓
      │  holds cluster                 Git repo  ← the only input
      │  CREDENTIALS                      │
      ↓                                   │  agent POLLS / is notified
   kubectl apply ──→ cluster              ↓
                                       Argo CD / Flux  (inside the cluster)
   credentials live OUTSIDE                 │
   the cluster, in CI                       ↓ reconciles, forever
                                          cluster
                                       no external credentials needed
```

:::ar
الـ GitOps معناها تلات حاجات، والتالتة هي اللي الناس بتنساها:

1. **كل** الحالة المطلوبة للنظام **متكتوبة في Git**.
2. فيه **عميل (agent) جوه الكلاستر** بيقارن Git بالواقع **على طول** وبيقفل الفرق.
3. **مفيش حاجة تانية عندها صلاحية كتابة على الكلاستر.**

**والفرق الجوهري عن الطريقة التقليدية هو اتجاه السهم.**

في الطريقة القديمة (**push**)، الـ pipeline هي اللي **بتدخل** على الكلاستر
وتعمل `kubectl apply`. يعني الـ pipeline **شايلة مفاتيح الكلاستر**.

في الـ GitOps (**pull**)، الـ pipeline **بتوقف عند Git**. وجوه الكلاستر فيه
برنامج بيبص على Git ويقول «أنا المفروض أبقى كده» وبينفّذ بنفسه.

**وده بيغيّر تلات حاجات فوراً:**

- **مفيش صلاحيات كلاستر بره الكلاستر.** الـ CI مش محتاجة kubeconfig خالص.
- **«إيه المنشور دلوقتي؟»** بقت `git log`، مش تحقيق.
- **أي حد يغيّر حاجة بإيده، بتترجع تلقائياً** — عشان العميل شايف إن الواقع
  مختلف عن Git وبيصلّحه.
:::

## Why it exists

Push-based CD works, and then accumulates four specific problems:

| Problem | Why it happens | What GitOps changes |
|:---|:---|:---|
| CI holds production credentials | It must, to `kubectl apply` | Credentials never leave the cluster |
| Nobody knows what is deployed | The cluster is the only source of truth | Git is the source of truth |
| Manual changes persist silently | Nothing compares against intent | Drift is detected and reverted |
| Rollback means re-running a pipeline | The old artefact may not rebuild | `git revert`, and the agent converges |

:::key The security argument is the strongest one
In push CD, a compromised CI runner has production credentials. CI runs
arbitrary code from pull requests — it is one of the most exposed systems you
have, and you have given it `cluster-admin`.

In pull CD, the agent's credentials live **inside** the cluster it manages, and
CI's only permission is to write to a Git repository. The blast radius of a
compromised runner collapses from "production" to "a commit someone will
review".
:::

:::ar ليه ظهرت؟
الطريقة القديمة شغالة، **وبعدين بتتراكم عليها ٤ مشاكل بعينها**:

| المشكلة | بتحصل ليه | الـ GitOps بتغيّر إيه |
|:---|:---|:---|
| الـ CI شايلة صلاحيات البرودكشن | **مضطرة**، عشان تعمل `apply` | الصلاحيات **عمرها ما تخرج** من الكلاستر |
| محدش عارف المنشور إيه | الكلاستر هو المصدر الوحيد | **Git هو المصدر** |
| التغييرات اليدوية بتفضل في سكوت | مفيش حاجة بتقارن بالمطلوب | الانحراف **بيتكشف ويترجع** |
| الرجوع = تعيد تشغيل pipeline | الـ artifact القديم ممكن مايتبنيش تاني | `git revert` والعميل بيوفّق |

:::key والحجة الأمنية هي أقوى حجة
في الـ push، **الـ CI runner المخترق معاه صلاحيات البرودكشن**.

وفكّر في ده كويس: **الـ CI بتشغّل كود جاي من pull requests** — يعني هي من
أكتر الأنظمة تعرّضاً عندك، **وإنت مديها `cluster-admin`**.

في الـ pull، صلاحيات العميل عايشة **جوه** الكلاستر اللي بيديره، وصلاحية
الـ CI الوحيدة إنها **تكتب في ريبو**.

**فدايرة الانفجار بتنكمش** من «البرودكشن» لـ «commit حد هيراجعه».
:::
:::

## What it is made of

| Piece | Job |
|:---|:---|
| **Config repository** | The desired state. Often separate from application source |
| **Agent** | Argo CD or Flux, running in the cluster |
| **Sync** | Apply Git state to the cluster |
| **Drift detection** | Notice reality differs from Git |
| **Self-heal** | Revert that difference automatically |
| **Health assessment** | Decide whether the applied resources are actually working |

### The two repositories

This split confuses people at first, and it is the important structural choice:

```diagram
   APP REPO                          CONFIG REPO
   ────────                          ───────────
   src/                              apps/web/deployment.yaml
   Dockerfile                        apps/web/service.yaml
   .github/workflows/ci.yml          apps/web/kustomization.yaml
        │                                 ↑
        │ CI: test, build, push image     │
        │                                 │
        └──→ registry: web:abc123 ────────┘
             then bump the tag in the config repo
                                          │
                                          ↓  agent watches THIS repo
                                       cluster
```

:::key Why not one repository?
You can use one, and small teams often should. The reasons to split:

- **A deploy is not a code change.** Rolling back config should not revert
  source history.
- **Different reviewers.** Platform owns the config repo; developers own the app.
- **Promotion between environments is a config change** — the same image tag
  moving from `staging/` to `prod/`. That is a one-line PR, and it is
  auditable.
- **CI writing to the app repo to bump a tag triggers CI again** — a loop you
  have to break with commit-message filters.
:::

:::ar الريبوهات الاتنين
التقسيمة دي بتلخبط الناس في الأول، **وهي أهم قرار هيكلي في الموضوع**.

- **ريبو التطبيق:** الكود، والـ Dockerfile، والـ CI. مخرجاته **صورة
  بتاج = الـ commit SHA**.
- **ريبو الإعدادات:** الـ YAML بتاع كوبرنيتيس. والعميل بيراقب **ده**.

**ولما الصورة تتبني، الـ CI بتعدّل سطر التاج في ريبو الإعدادات، والعميل
بيشوف التغيير وينشره.**

:::key وليه مش ريبو واحد؟
**ينفع ريبو واحد**، والفرق الصغيرة غالباً **المفروض** تعمل كده — التقسيم
بيضيف تعقيد.

**وأسباب التقسيم:**

1. **النشر مش تغيير كود.** إنك ترجّع الإعدادات للخلف **مالوش لازمة** يرجّع
   تاريخ الكود.
2. **مراجعين مختلفين.** فريق المنصة بيملك ريبو الإعدادات.
3. **الترقية بين البيئات بقت تغيير إعدادات** — نفس التاج بينتقل من
   `staging/` لـ `prod/`. **PR من سطر واحد، وموثّق.**
4. **ولو ريبو واحد:** الـ CI هتكتب في نفس الريبو عشان تعدّل التاج،
   **فهتشغّل الـ CI تاني** — لوب لازم تكسرها بفلاتر على رسايل الـ commit،
   وده وجع.
:::
:::

## How to use it — Argo CD

```sh title="Install and reach it"
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d; echo

kubectl port-forward -n argocd svc/argocd-server 8080:443
```

```yaml title="An Application — the unit Argo CD manages"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web
  namespace: argocd
spec:
  project: default

  source:
    repoURL: https://github.com/you/config-repo
    targetRevision: main            # a branch, tag or commit
    path: apps/web                  # directory inside the repo

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true                   # delete resources removed from Git
      selfHeal: true                # revert manual cluster changes
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 5
      backoff: { duration: 5s, factor: 2, maxDuration: 3m }
```

:::warn `prune` and `selfHeal` are both off by default, and both are the point
Without `prune`, deleting a manifest from Git leaves the object running in the
cluster — exactly the `kubectl apply` problem GitOps was supposed to fix.

Without `selfHeal`, Argo CD *reports* drift but does not correct it, so a
manual `kubectl edit` survives indefinitely and your Git repo quietly stops
being true.

Turn both on once you trust the repo. Turning them on for the first time
against an existing cluster can delete things — run a manual sync with a diff
first:

```sh
argocd app diff web            # exactly what would change
argocd app sync web --dry-run
```
:::

### The app-of-apps pattern

Managing 50 Applications by hand defeats the purpose. Instead, one Application
whose contents are *other* Applications:

```diagram
   root Application  (points at clusters/prod/)
        │
        ├──→ Application: monitoring   → charts/kube-prometheus-stack
        ├──→ Application: ingress      → charts/ingress-nginx
        ├──→ Application: web          → apps/web
        └──→ Application: api          → apps/api

   Adding a service = one file in the config repo. Nothing else.
```

:::ar إزاي تستخدمها عملياً
**الـ Application هي الوحدة اللي Argo CD بيديرها.** فيها ٣ حاجات:

| الجزء | بيقول إيه |
|:---|:---|
| `source` | **منين** أجيب المطلوب (ريبو + فرع + مسار) |
| `destination` | **فين** أنشره (كلاستر + namespace) |
| `syncPolicy` | **إزاي** أتصرّف لما ألاقي فرق |

:::danger و `prune` و `selfHeal` **مقفولين افتراضياً**، وهما بيت القصيد
دي أهم نقطة عملية في الصفحة.

**من غير `prune`:** تمسح ملف من Git، والأوبجكت **بيفضل شغّال في الكلاستر**
— يعني نفس مشكلة `kubectl apply` اللي الـ GitOps كانت المفروض تحلها.

**من غير `selfHeal`:** Argo CD **بيقولك** إن فيه انحراف، **بس مش بيصلّحه**.
فأي `kubectl edit` يدوي **بيعيش للأبد**، وريبو Git بيبطّل يكون صحيح **في سكوت**.

**شغّلهم الاتنين** أول ما تثق في الريبو.

**بس خد بالك:** إنك تشغّلهم لأول مرة على كلاستر موجود **ممكن يمسح حاجات**.
اعمل sync يدوي بـ diff الأول:

```sh
argocd app diff web            # إيه اللي هيتغير بالظبط
argocd app sync web --dry-run
```
:::

**ونمط app-of-apps:** إنك تدير ٥٠ Application بإيدك **بيلغي الفايدة**.
فبتعمل **Application واحدة محتواها Applications تانية**.

والنتيجة: **إضافة سيرفيس جديد = ملف واحد في ريبو الإعدادات. وخلاص.**
:::

## Secrets — the problem GitOps creates

"Everything in Git" collides with "never commit secrets". Four answers, worst
to best:

| Approach | How it works | Verdict |
|:---|:---|:---|
| Plain Secret in Git | base64 is **not** encryption | Never |
| **Sealed Secrets** | Encrypt with a cluster public key; only the in-cluster controller can decrypt | Fine. Ciphertext is per-cluster, so rotation is awkward |
| **SOPS** (+ age/KMS) | Encrypt values in the YAML itself; Flux/Argo decrypt at apply | Good. Readable diffs, keys in a KMS |
| **External Secrets Operator** | Git holds only a *reference*; the operator fetches from Vault/ASM/GSM | Best for teams. Rotation happens outside Git entirely |

:::danger `kubectl get secret -o yaml` is not encrypted, it is encoded
base64 exists to make binary safe in YAML. It is trivially reversed:

```sh
kubectl get secret db -o jsonpath='{.data.password}' | base64 -d
```

A "Secret" committed to Git is a plaintext credential in your history forever.
If it happens: **rotate the credential first**, then clean the history —
rewriting history does not un-distribute what was already cloned.
:::

:::ar الأسرار — المشكلة اللي الـ GitOps بتعملها
«كل حاجة في Git» بتتصادم مع «عمرك ما تحط أسرار في Git». وفيه ٤ حلول، من
الأوحش للأحسن:

| الطريقة | بتشتغل إزاي | الحكم |
|:---|:---|:---|
| Secret عادي في Git | الـ base64 **مش تشفير** | **أبداً** |
| **Sealed Secrets** | تشفّر بمفتاح عام للكلاستر، والكنترولر بس بيفك | كويسة. بس الشفرة مربوطة بالكلاستر |
| **SOPS** | تشفّر القيم جوه الـ YAML، والعميل بيفك وقت النشر | كويسة. الـ diffs مقروءة |
| **External Secrets** | Git فيها **إشارة بس**، والأوبجكت بيجيب من Vault | **الأحسن للفرق** |

:::danger والـ base64 **مش تشفير**، ده ترميز
الناس بتلخبط في دي وبتحط Secrets في Git وهي فاكرة إنها مشفّرة.

```sh
kubectl get secret db -o jsonpath='{.data.password}' | base64 -d
# والباسورد طلع. كده.
```

الـ base64 موجود عشان الداتا الثنائية تعدّي في YAML، **مش عشان يخبّي حاجة**.

**فأي Secret اتعمله commit = باسورد مكتوب صريح في تاريخ Git للأبد.**

**ولو حصل:** **غيّر الباسورد الأول**. تنضيف التاريخ **مش بيسحب** اللي حد
نسخه خلاص.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `OutOfSync` forever | A controller or webhook mutates the object after apply | `ignoreDifferences` for that field |
| Sync loop, endlessly re-applying | Same, usually a defaulted or generated field | Same; find the field with `argocd app diff` |
| `Unknown` health | Custom resource Argo CD cannot assess | Write a health check Lua script, or accept it |
| Sync succeeded, app broken | Resources applied but not Ready | Health assessment plus `--wait`-style gates |
| Manual fix reverted mid-incident | `selfHeal: true` doing its job | Disable auto-sync for the app *deliberately*, then fix Git |
| Image updated but nothing deployed | Nobody bumped the tag in the config repo | Image Updater, or a CI step that commits the bump |

:::danger Self-heal will fight you during an incident
At 3am you `kubectl edit` a Deployment to raise a memory limit. Ninety seconds
later Argo CD reverts it, because Git still says otherwise. You do it again. It
reverts again.

This is the system working correctly, and it is genuinely dangerous if you have
not planned for it. Decide in advance and write it in the runbook:

```sh
# Option A — disable auto-sync for THIS app while you work
argocd app set web --sync-policy none

# Option B (better) — commit the fix to Git. Slower, but the cluster and the
# repo never disagree, and the change is reviewed afterwards rather than lost.
```

Option B is the discipline GitOps is asking for. Option A exists because
sometimes minutes matter — but if you take it, the follow-up task is
re-enabling sync, and it must not be forgotten.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| `OutOfSync` على طول | فيه كنترولر بيعدّل الأوبجكت بعد النشر | `ignoreDifferences` للحقل ده |
| لوب sync لا نهائي | نفس السبب، حقل بيتولّد تلقائياً | لاقي الحقل بـ `argocd app diff` |
| صحة `Unknown` | مورد مخصص Argo مش عارف يحكم عليه | سكريبت health، أو اقبلها |
| الـ sync نجح والتطبيق باظ | الموارد اتنشرت بس مش Ready | فعّل تقييم الصحة |
| الصورة اتحدّثت ومفيش ديبلوي | محدش عدّل التاج في ريبو الإعدادات | Image Updater، أو خطوة CI بتعمل commit |

:::danger والـ self-heal هيتخانق معاك **وقت الأزمة**
دي حالة حقيقية لازم تكون مستعدلها **قبل** ما تحصل.

الساعة ٣ الفجر، بتعمل `kubectl edit` عشان ترفع حد الرام. **بعد ٩٠ ثانية
Argo CD بيرجّعه**، عشان Git لسه بيقول حاجة تانية. تعمله تاني، يرجّعه تاني.

**والسيستم شغّال صح** — وده بالظبط الخطر لو ما كنتش محضّر.

**قرّر بدري واكتبها في الـ runbook:**

```sh
# الحل أ — اقفل الـ auto-sync للتطبيق ده وإنت شغّال
argocd app set web --sync-policy none

# الحل ب (أحسن) — اعمل commit للإصلاح في Git.
# أبطأ، بس الكلاستر وGit عمرهم ما يختلفوا، والتغيير بيتراجع بعدين
# بدل ما يضيع.
```

**الحل ب هو الانضباط اللي الـ GitOps بتطلبه.** والحل أ موجود عشان ساعات
الدقايق بتفرق — **بس لو أخدته، فيه مهمة بعده اسمها «رجّع الـ sync»،
وممنوع تتنسى**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is GitOps, and how is it different from just having a CD pipeline?
The difference is **the direction of the arrow and where credentials live**.

| | Push CD | Pull CD (GitOps) |
|:---|:---|:---|
| Who applies | CI, from outside | An agent, from inside |
| Cluster credentials | **In CI** | Never leave the cluster |
| Source of truth | The cluster | The Git repo |
| Manual drift | Persists silently | Detected, and reverted if self-heal is on |
| "What is deployed?" | Inspect the cluster | `git log` |
| Rollback | Re-run a pipeline | `git revert` |

Three claims worth making explicitly:

1. **Security.** CI runs untrusted code from pull requests; giving it
   `cluster-admin` is a large blast radius. GitOps reduces CI's permission to
   "write a commit".
2. **Auditability.** Every change is a reviewed, attributed, reversible commit
   — you get change management without a change-management tool.
3. **Convergence.** Because the agent reconciles continuously, the cluster is
   correct *even after* someone changes it by hand.

:::key The honest caveat that scores well
GitOps is excellent for the *declarative* part of a system and awkward for the
imperative part — database migrations, one-off jobs, and anything with
ordering requirements across repos. Volunteering that shows judgement rather
than enthusiasm.
:::

:::ar
الفرق هو **اتجاه السهم، وفين الصلاحيات عايشة**.

| | Push | Pull (GitOps) |
|:---|:---|:---|
| مين بينشر | الـ CI، **من بره** | عميل، **من جوه** |
| صلاحيات الكلاستر | **في الـ CI** | **عمرها ما تخرج** من الكلاستر |
| مصدر الحقيقة | الكلاستر | **ريبو Git** |
| التغيير اليدوي | بيفضل **في سكوت** | بيتكشف، وبيترجع |
| «إيه المنشور؟» | تفتّش في الكلاستر | **`git log`** |
| الرجوع | تعيد pipeline | **`git revert`** |

**وتلات حاجات قولهم صريح:**

1. **الأمن.** الـ CI بتشغّل كود مش موثوق جاي من PRs. إنك تديها
   `cluster-admin` **دايرة انفجار ضخمة**. الـ GitOps بتنزّل صلاحيتها
   لـ «اكتب commit».
2. **التوثيق.** كل تغيير **commit مُراجَع ومنسوب وقابل للرجوع** — يعني
   إدارة تغيير **من غير أداة إدارة تغيير**.
3. **التقارب.** عشان العميل بيوفّق **باستمرار**، الكلاستر بيبقى صح
   **حتى بعد** ما حد يغيّر بإيده.

**والتحفّظ الأمين اللي بياخد درجة عالية:**

الـ GitOps **ممتازة للجزء الوصفي** من النظام، **ووحشة في الجزء الأمري** —
migrations الداتابيز، والـ jobs اللي بتتشغّل مرة، وأي حاجة ليها ترتيب
بين ريبوهات.

وإنك تقول دي **من نفسك** بيوري **حكم**، مش حماس.
:::
:::

:::q An engineer fixes production with `kubectl edit` during an incident. What happens under GitOps, and what should they have done?
**With `selfHeal: true`, the agent reverts the fix** — typically within the
reconcile interval, often under three minutes. The engineer's change is gone
and production breaks again.

This is correct behaviour: Git said otherwise, and the whole model is that Git
wins. But it is a genuine operational hazard, and "it works as designed" is not
a sufficient answer.

**What should happen, in order of preference:**

1. **Commit the fix to Git.** The agent applies it, and cluster and repo never
   disagree. Slower by the length of a PR — which is why teams keep an
   emergency path with post-hoc review.
2. **Deliberately suspend sync for that app**, fix, then reconcile Git and
   re-enable. The suspension must be a tracked task or it will be forgotten,
   and an app silently out of sync for weeks is worse than no GitOps at all.

```sh
argocd app set web --sync-policy none    # suspend
# fix, then bring Git in line, then:
argocd app set web --sync-policy automated --self-heal --auto-prune
```

:::key
The signal being tested is whether you understand that **GitOps trades
emergency speed for guaranteed consistency**, and whether you have thought
about the emergency path *before* the emergency. A team that has not is a team
that will disable self-heal after their first bad night and never turn it back
on.
:::

:::ar
**مع `selfHeal: true` العميل بيرجّع الإصلاح** — غالباً في أقل من ٣ دقايق.
تغيير المهندس بيضيع **والبرودكشن بيقع تاني**.

**والسلوك ده صح:** Git قال حاجة تانية، والموديل كله إن **Git بيكسب**.

**بس دي خطورة تشغيلية حقيقية**، و«هو شغال زي ما اتصمّم» **مش إجابة كافية**.

**واللي المفروض يحصل، بالترتيب:**

**١. اعمل commit للإصلاح في Git.** العميل هينشره، **والكلاستر و Git
عمرهم ما يختلفوا**. أبطأ بمقدار وقت الـ PR — وعشان كده الفرق بتسيب
مسار طوارئ بمراجعة **بعدية**.

**٢. علّق الـ sync بقصد** للتطبيق ده، صلّح، وبعدين وفّق Git وارجّع الـ sync.

```sh
argocd app set web --sync-policy none
# صلّح، وبعدين وفّق Git، وبعدين:
argocd app set web --sync-policy automated --self-heal --auto-prune
```

**والتعليق ده لازم يبقى مهمة متسجّلة**، وإلا هتتنسى — **وتطبيق قاعد
خارج الـ sync لأسابيع أوحش من إنك مش مستخدم GitOps من الأصل**.

**واللي بيتقاس عليه:** إنك فاهم إن **الـ GitOps بتقايض سرعة الطوارئ
مقابل اتساق مضمون**، وإنك فكّرت في مسار الطوارئ **قبل** الطوارئ.

والفريق اللي ما فكّرش، هيقفل الـ self-heal بعد أول ليلة وحشة **وعمره
ما هيرجّعه**.
:::
:::

:::q How do you handle secrets when everything is supposed to be in Git?
You never put the secret itself in Git. Four options, and you should be able to
compare them:

| Option | Where the plaintext lives | Trade-off |
|:---|:---|:---|
| Sealed Secrets | Nowhere; ciphertext in Git, private key in-cluster | Ciphertext is bound to one cluster's key — DR and multi-cluster are awkward |
| SOPS + age/KMS | Nowhere; encrypted values in Git | Readable diffs, key management is yours |
| External Secrets Operator | In Vault / AWS SM / GCP SM | Git holds only a reference; rotation happens outside Git entirely |
| Plain base64 Secret | **In Git, in plaintext** | Never do this |

**For a team, External Secrets is usually right**, because rotation is the
requirement people forget. With Sealed Secrets or SOPS, rotating a credential
means a commit; with an external store, it means updating the store and the
operator picks it up.

:::warn base64 is encoding, not encryption
`kubectl get secret x -o jsonpath='{.data.password}' | base64 -d` returns the
password. A Secret manifest in Git is a plaintext credential in history
forever. If one is committed, **rotate first** — rewriting history does not
un-distribute what has already been cloned.
:::

:::ar
**إنت عمرك ما بتحط السر نفسه في Git.** وفيه ٤ اختيارات، ولازم تعرف تقارن
بينهم:

| الاختيار | النص الصريح عايش فين | المقايضة |
|:---|:---|:---|
| Sealed Secrets | **مفيش**؛ شفرة في Git والمفتاح في الكلاستر | الشفرة **مربوطة بمفتاح كلاستر واحد** — الكوارث وتعدد الكلاسترات وجع |
| SOPS + KMS | **مفيش**؛ قيم مشفّرة في Git | الـ diffs مقروءة، بس إدارة المفاتيح عليك |
| External Secrets | في **Vault** أو AWS SM | Git فيها **إشارة بس**؛ والتغيير الدوري بيحصل بره Git خالص |
| Secret بـ base64 | **في Git، صريح** | **عمرك ما تعملها** |

**وللفرق، External Secrets غالباً هي الصح** — عشان **التغيير الدوري
(rotation)** هو المطلب اللي الناس بتنساه.

مع Sealed Secrets أو SOPS، تغيير باسورد معناه **commit**. ومع مخزن خارجي،
معناه **تحدّث المخزن والأوبجكت بياخده لوحده**.
:::
:::

## Key takeaways

- **GitOps is pull, not push.** An agent inside the cluster reconciles against
  Git; CI never holds cluster credentials.
- **The security argument is the strongest one.** CI runs untrusted PR code —
  reducing its permission to "write a commit" is a large win.
- **`prune` and `selfHeal` are off by default and are the whole point.** Turn
  them on, after a `diff`.
- **Git becomes the answer to "what is deployed?"** — that is the day-to-day
  benefit you actually feel.
- **Self-heal will fight you during an incident.** Decide the emergency path in
  advance and write it in the runbook.
- **Secrets need a real answer** — External Secrets, SOPS or Sealed Secrets.
  base64 is not encryption.
- **GitOps suits declarative state and not imperative steps.** Migrations and
  one-off jobs still need somewhere to live.

:::ar الخلاصة
1. **الـ GitOps سحب مش دفع.** عميل جوه الكلاستر بيوفّق مع Git،
   **والـ CI عمرها ما تشيل صلاحيات الكلاستر**.
2. **الحجة الأمنية أقوى حجة.** الـ CI بتشغّل كود PRs مش موثوق — إنك
   تنزّل صلاحيتها لـ «اكتب commit» **مكسب كبير**.
3. **`prune` و `selfHeal` مقفولين افتراضياً وهما بيت القصيد.** شغّلهم،
   **بعد `diff`**.
4. **Git بيبقى هو إجابة «إيه المنشور؟»** — وده المكسب اللي بتحسه يومياً.
5. **الـ self-heal هيتخانق معاك وقت الأزمة.** قرّر مسار الطوارئ **بدري**
   واكتبه في الـ runbook.
6. **الأسرار محتاجة حل حقيقي** — External Secrets أو SOPS أو Sealed
   Secrets. **والـ base64 مش تشفير.**
7. **الـ GitOps بتناسب الحالة الوصفية مش الخطوات الأمرية.** الـ migrations
   والـ jobs لسه محتاجين مكان.
:::
