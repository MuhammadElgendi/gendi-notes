---
title: Helm
slug: helm
type: guide
domain: 03-kubernetes
tags: [kubernetes, helm, packaging]
keywords: [chart, values, template, release, repository, subchart, hooks,
           helmfile, kustomize, umbrella chart, rollback, tiller, oci,
           هيلم, تغليف, قوالب, نشر]
level: 2
status: stable
prerequisites: [kubernetes-basics, kubernetes-deployments]
related: [kubernetes-architecture, gitops, ci-cd, devops-interview-questions]
updated: 2026-09-13
---

# Helm

> Helm is a templating engine plus a release ledger. Separating those two jobs in your head explains every Helm problem you will have.

## What is it?

Helm packages a set of Kubernetes manifests into a **chart** — templated YAML
plus a file of default values — and installs it as a named **release** it keeps
track of.

```diagram
   CHART                    VALUES                  RELEASE
   ─────                    ──────                  ───────
   templates/*.yaml    +    values.yaml     ──→     plain Kubernetes YAML
   with {{ }} holes         your settings    render  applied to the cluster
                                                     │
                                                     └─ and a record of
                                                        WHAT was applied,
                                                        so it can be undone
```

:::ar
Helm بيعمل حاجتين، والناس بتخلط بينهم — **وفصلهم في دماغك بيحل أغلب مشاكلك معاه**:

**١. محرّك قوالب (templating).** إنت عندك YAML فيه «فراغات»، وملف قيم
بيملا الفراغات دي. فبدل ما تعمل نسخة من الـ YAML لكل بيئة، بتعمل نسخة
واحدة وملف قيم لكل بيئة.

**٢. سجل إصدارات (release ledger).** Helm **بيفتكر** إنت نشرت إيه بالظبط
في كل مرة — فبيقدر يرجّعك للخلف، وبيقدر يعرف إيه اللي اتشال لما تحدّث.

**والجزء التاني ده هو اللي بيفرق عن `kubectl apply`.**

لو عملت `kubectl apply -f .` وبعدين مسحت ملف من الفولدر وعملت apply تاني —
**الحاجة القديمة بتفضل في الكلاستر للأبد**، عشان `kubectl` مش فاكر إنت
نشرت إيه قبل كده.

Helm فاكر. فلما تعمل `helm upgrade`، هو بيقارن بين اللي نشره قبل كده واللي
بينشره دلوقتي، **وبيمسح اللي اتشال**.
:::

## Why it exists

Without it you hit three problems, in this order:

| Problem | The manual workaround | Why it fails |
|:---|:---|:---|
| The same app in dev/staging/prod | Copy the YAML three times | They drift; a fix lands in one |
| Installing someone else's software | Read their docs, copy 15 manifests | No upgrade path, no uninstall |
| Undoing a bad deploy | `kubectl apply` the old files — if you kept them | You did not keep them |

:::key What Helm adds over `kubectl apply -f`
**A record of what a release contained.** `kubectl apply` is stateless — it
knows the file in front of it and nothing else.

So when you delete a manifest from your directory, `kubectl apply` leaves the
object orphaned in the cluster forever. `helm upgrade` diffs against the
previous release and **removes what is no longer there**.

That ledger is also what makes `helm rollback` a single command.
:::

## What it is made of

```diagram
   mychart/
   ├── Chart.yaml           name, version, appVersion, dependencies
   ├── values.yaml          DEFAULT values — the chart's public API
   ├── templates/
   │   ├── deployment.yaml  Go templates that render to manifests
   │   ├── service.yaml
   │   ├── _helpers.tpl     reusable named templates (leading _ = not rendered)
   │   └── NOTES.txt        printed after install
   └── charts/              vendored subcharts (dependencies)
```

| Piece | What it is |
|:---|:---|
| **Chart** | The package: templates + defaults + metadata |
| **Values** | The inputs. Layered: chart defaults → `-f file` → `--set` |
| **Release** | One installation of a chart, with a name and a revision number |
| **Repository** | Where charts are hosted (an HTTP index, or an OCI registry) |
| **Revision** | A numbered snapshot of a release, stored as a Secret in-cluster |

:::ar يعني إيه كل واحدة
| الحاجة | يعني إيه | تخيلها زي |
|:---|:---|:---|
| **Chart** | الباكدج نفسه: قوالب + قيم افتراضية | ملف التنصيب |
| **Values** | المدخلات اللي بتملا الفراغات | إعدادات التنصيب |
| **Release** | **تنصيبة واحدة** من الـ chart، بإسم | البرنامج بعد ما اتنصّب |
| **Repository** | المكان اللي الـ charts متخزّنة فيه | الاب ستور |
| **Revision** | لقطة مرقّمة من الـ release | نقطة استعادة |

**وأهم فرق تفهمه:** الـ **Chart** حاجة واحدة، والـ **Releases** منه ممكن
تبقى كتير.

يعني تقدر تنصّب نفس chart الـ `redis` **تلات مرات** بأسماء مختلفة
(`redis-cache`، `redis-queue`، `redis-session`) في نفس الكلاستر، وكل واحدة
**release مستقلة** بقيم مختلفة وتقدر ترجّعها لوحدها.

**وفين الـ Revisions متخزّنة؟** ودي حاجة مهمة عملياً:

```sh
kubectl get secret -l owner=helm -n <namespace>
# sh.helm.release.v1.myapp.v1
# sh.helm.release.v1.myapp.v2   ← كل revision = Secret
```

يعني Helm **مش** بيخزّن حاجة على جهازك. كل التاريخ **جوه الكلاستر نفسه**،
في Secrets. وده معناه إن أي حد عنده صلاحية يقرا الـ Secrets في الـ
namespace دي **يقدر يقرا القيم اللي نشرت بيها** — وده بيشمل الباسوردات
لو حطيتها في الـ values.
:::

## How to use it

### Installing something that already exists

```sh title="The commands you will use daily"
# 1. Add a repository and refresh the index
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 2. Look before you install — what can this chart be configured with?
helm show values bitnami/redis | less

# 3. Install as a NAMED release. The name is how you refer to it forever.
helm install my-redis bitnami/redis \
  --namespace data --create-namespace \
  --set auth.password=... \
  --version 20.1.0            # PIN the chart version. Always.

# 4. What is installed on this cluster?
helm list -A
```

### The three commands that prevent most mistakes

```sh
# Render locally — no cluster contact. Catches template errors instantly.
helm template my-redis bitnami/redis -f prod-values.yaml

# Dry run against the cluster — also runs server-side validation
helm install my-redis bitnami/redis --dry-run --debug

# See exactly what an upgrade WOULD change (needs the helm-diff plugin)
helm plugin install https://github.com/databus23/helm-diff
helm diff upgrade my-redis bitnami/redis -f prod-values.yaml
```

:::key `helm template` is the answer to "what does this actually do?"
A chart is opaque until you render it. `helm template` turns it back into plain
YAML you can read, diff and commit — with no cluster and no release.

Use it to review third-party charts before trusting them, to debug your own
templates, and in CI to lint the output. It is the single most useful Helm
command and the one beginners never learn.
:::

### Writing a chart

```yaml title="templates/deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  # include a named template from _helpers.tpl; nindent keeps YAML valid
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "mychart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "mychart.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          # default lets the chart work with no values supplied
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - containerPort: {{ .Values.service.port }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
```

```yaml title="values.yaml — the chart's public API. Document it."
replicaCount: 2
image:
  repository: nginx
  tag: ""              # empty → falls back to Chart.appVersion
service:
  port: 80
resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits:   { memory: 256Mi }
```

:::warn `{{-` and `nindent` are not decoration — they are why your YAML parses
Go templates emit text, and YAML cares about whitespace. Two rules:

- **`{{-` strips preceding whitespace including the newline.** Without it you
  get blank lines where a conditional was false, which is usually harmless —
  until it is not.
- **`nindent N` adds a newline then indents by N.** Use it whenever you inject
  a block. `indent` without the leading newline is the usual cause of
  `error converting YAML to JSON: did not find expected key`.

When a chart fails to render, run `helm template` and read the *rendered*
output. The error line number refers to the rendered YAML, not your template.
:::

:::ar
القوالب دي Go templates، والـ YAML **بيهتم بالمسافات**. فخد بالك من حاجتين:

**`{{-`** بتشيل المسافات والسطر اللي قبلها. من غيرها بتلاقي سطور فاضية
مكان الشروط اللي مانفعتش.

**`nindent N`** بتحط سطر جديد وبعدين تزيح بـ N مسافة. **استخدمها كل ما
تحقن بلوك.** واستخدام `indent` بدالها (من غير السطر الجديد) هو السبب
المعتاد لإيرور:

```text
error converting YAML to JSON: did not find expected key
```

:::key ولما القالب يفشل، اقرا **الناتج** مش القالب
رقم السطر في رسالة الخطأ بيشاور على **الـ YAML بعد ما اترندر**، مش على
ملف القالب بتاعك.

فاعمل كده:

```sh
helm template myapp ./mychart -f values.yaml > /tmp/out.yaml
# وروح للسطر اللي الإيرور قاله في /tmp/out.yaml
```

**و `helm template` دي أنفع أمر في Helm كله**، وأقل واحد المبتدئين
بيتعلموه. هي بتحوّل الـ chart الغامض ده لـ YAML عادي **تقدر تقراه
وتقارنه وتعمله commit** — من غير كلاستر ومن غير release.
:::
:::

### Upgrading and rolling back

```sh
# Upgrade, or install if it does not exist yet — the CI-friendly form
helm upgrade --install my-redis bitnami/redis \
  -f prod-values.yaml \
  --version 20.1.0 \
  --atomic \                 # roll back automatically if it fails
  --wait --timeout 5m        # wait for resources to be Ready

# History and rollback
helm history my-redis
helm rollback my-redis 3     # back to revision 3
```

:::key `--atomic --wait` is the difference between a deploy and a hope
Without `--wait`, Helm returns success as soon as the objects are *accepted* by
the API server — exactly the `kubectl apply` problem, where a crash-looping pod
still reports green.

`--wait` blocks until resources are Ready. `--atomic` adds automatic rollback
on failure, so a broken upgrade returns you to the last working revision
instead of leaving the release half-applied.

In CI, always use both.
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `cannot re-use a name that is still in use` | A release with that name exists | `helm list -A`; use `upgrade --install` |
| `has no deployed releases` | A previous install failed and left a `failed` release | `helm uninstall` then reinstall, or `--force` |
| `did not find expected key` | Indentation from `indent` vs `nindent` | Render with `helm template` and read the output |
| Upgrade hangs forever | `--wait` with pods that never become Ready | `kubectl describe` a new pod; check the probes |
| `field is immutable` | Changing a Deployment `selector`, or a PVC size downward | Delete and recreate, or use a new resource name |
| Values seem ignored | Wrong key path, or precedence | `helm get values <release>` shows what was *actually* used |
| Rollback does not restore data | Helm manages manifests, **not** PVC contents | Restore the data separately; Helm never touches volumes |
| Secrets visible in `helm get values` | Values are stored in a release Secret | Keep secrets out of values; use a secret manager |

:::danger `helm rollback` does not roll back your data
This surprises people during an incident, which is the worst time to learn it.

Helm's ledger records **manifests**. Rolling back changes the Deployment image,
the ConfigMap contents, the replica count — everything declarative.

It does **not** undo:

- a database migration your app ran on startup
- anything written to a PersistentVolume
- messages consumed from a queue
- rows changed by the new version

So a rollback of an app that ran a destructive migration restores the *old
code* against a *new schema*, which is frequently worse than the bug you were
fixing. This is the same constraint as rolling updates: **migrations must be
backwards-compatible**, because rollback assumes the data layer did not move.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| `cannot re-use a name` | فيه release بنفس الاسم | `helm list -A` واستخدم `upgrade --install` |
| `has no deployed releases` | تنصيبة قديمة فشلت وسابت release بحالة `failed` | `helm uninstall` وبعدين نصّب |
| `did not find expected key` | مشكلة مسافات (`indent` بدل `nindent`) | `helm template` واقرا الناتج |
| الـ upgrade بيقعد معلّق | `--wait` وبودات مش بتبقى Ready | `kubectl describe` لبود جديد، شوف الـ probes |
| `field is immutable` | بتغيّر `selector` في Deployment | امسح واعمل من الأول، أو غيّر الاسم |
| القيم مش بتتطبّق | مسار مفتاح غلط، أو أولوية | `helm get values <release>` بيوريك **اللي اتطبّق فعلاً** |

:::danger و `helm rollback` **مش** بيرجّع الداتا
دي بتفاجئ الناس **وقت الأزمة**، وده أوحش وقت تتعلمها فيه.

Helm بيسجّل **الـ manifests**. فالرجوع بيغيّر صورة الـ Deployment،
ومحتوى الـ ConfigMap، وعدد النسخ — **كل الحاجات الوصفية**.

**وهو مش بيرجّع:**

- **migration** التطبيق شغّلها وهو بيقوم
- أي حاجة اتكتبت على **PersistentVolume**
- رسايل اتاخدت من طابور
- صفوف الإصدار الجديد غيّرها في الداتابيز

**والنتيجة الوحشة:** لو رجّعت تطبيق شغّل migration مدمّرة، إنت رجّعت
**الكود القديم** على **schema جديدة** — وده غالباً **أوحش من الباج اللي
كنت بتصلّحه**.

**ونفس القيد بتاع الـ rolling updates:** الـ migrations **لازم** تكون
متوافقة للخلف، عشان الرجوع بيفترض إن طبقة الداتا **ما اتحركتش**.
:::
:::

## Helm versus Kustomize

Both solve "the same manifests, different per environment", differently.

| | Helm | Kustomize |
|:---|:---|:---|
| Mechanism | Template, then render | Patch a base with overlays |
| Input | `values.yaml` | `kustomization.yaml` patches |
| Valid YAML before rendering | **No** — it is Go templates | **Yes** — always real YAML |
| Release tracking | Yes, with rollback | No — it just produces YAML |
| Third-party software | The ecosystem standard | Rare |
| Complexity ceiling | Nested conditionals get unreadable fast | Deep overlay chains get hard to trace |
| Built into `kubectl` | No | Yes — `kubectl apply -k` |

**A reasonable default:** Kustomize for your own applications, Helm for
installing other people's. They combine — Kustomize can post-process rendered
Helm output, and Argo CD supports that directly.

:::ar Helm ولا Kustomize؟
الاتنين بيحلّوا نفس المشكلة — «نفس الـ manifests بإعدادات مختلفة لكل بيئة» —
بطريقتين مختلفتين.

| | Helm | Kustomize |
|:---|:---|:---|
| الطريقة | **قالب** بيترندر | **ترقيع** لأساس بطبقات |
| المدخلات | `values.yaml` | patches |
| YAML صالح قبل الرندر؟ | **لأ**، ده Go templates | **أيوه**، دايماً YAML حقيقي |
| بيتابع الإصدارات؟ | **أيوه**، ومعاه rollback | لأ، بيطلّع YAML وخلاص |
| برامج الناس التانية | **هو المعيار** | نادر |
| جوه `kubectl`؟ | لأ | **أيوه**: `kubectl apply -k` |

**والاختيار المعقول:**

- **Kustomize** لتطبيقاتك إنت.
- **Helm** عشان تنصّب برامج الناس (Prometheus، Redis، Ingress controllers).

**وينفع تستخدم الاتنين مع بعض:** Kustomize يقدر يعالج ناتج Helm بعد
الرندر، و Argo CD بيدعم ده مباشرة.

:::note وفين Tiller؟
لو قريت شرح قديم، هتلاقي كلام عن حاجة اسمها **Tiller** — سيرفر كان بيتنصّب
جوه الكلاستر ومعاه صلاحيات واسعة، وكان **كابوس أمني**.

**اتشال خلاص في Helm 3.** دلوقتي `helm` عميل بس، بيكلّم الـ API server
**بصلاحياتك إنت** من الـ kubeconfig.

فلو لقيت شرح بيتكلم عن `helm init` أو Tiller، **ده شرح قديم، سيبه**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What does Helm give you that `kubectl apply -f` does not?
**A release ledger.** `kubectl apply` is stateless — it knows only the files in
front of it right now.

Three consequences:

| | `kubectl apply -f ./manifests` | `helm upgrade` |
|:---|:---|:---|
| Delete a manifest from the directory | Object stays in the cluster **forever**, orphaned | Removed, because Helm diffs against the previous release |
| Undo a bad deploy | Re-apply old files — if you still have them | `helm rollback <release> <revision>` |
| "What is installed here?" | Inspect the cluster and guess | `helm list -A` |

Plus templating, which Kustomize also solves — so **the ledger is the part
that is genuinely Helm's**.

:::key The nuance worth adding
`kubectl apply --prune` exists and partially closes the first gap, but it is
label-selector based and easy to get dangerously wrong. Naming it shows you
know the landscape rather than reciting Helm marketing.
:::

:::ar
**سجل الإصدارات (release ledger).** الـ `kubectl apply` **بلا ذاكرة** — هو
عارف الملفات اللي قصاده دلوقتي وبس.

| | `kubectl apply -f` | `helm upgrade` |
|:---|:---|:---|
| تمسح ملف من الفولدر | الأوبجكت **بيفضل في الكلاستر للأبد** | بيتشال، عشان Helm بيقارن |
| ترجّع ديبلوي باظ | تطبّق الملفات القديمة — **لو لسه معاك** | `helm rollback` |
| «إيه المنصّب هنا؟» | تبص في الكلاستر وتخمّن | `helm list -A` |

وطبعاً القوالب — **بس Kustomize بيحلها كمان**، فالسجل ده هو **الحاجة اللي
Helm لوحده بيقدمها**.

**والإضافة اللي تبيّن إنك فاهم المجال:** إن `kubectl apply --prune`
موجودة وبتحل جزء من المشكلة الأولى، **بس هي مبنية على labels وسهل جداً
تغلط فيها بشكل خطير**. إنك تسمّيها بيوري إنك عارف المنظر كله مش بتردّد
دعاية Helm.
:::
:::

:::q A `helm upgrade` fails halfway. What state is the cluster in, and what do you do?
**Partially applied**, unless you used `--atomic`.

Helm applies resources in a dependency-aware order. If it fails at resource 12
of 20, the first 11 are live and the release is marked `failed`.

```sh
helm history my-app            # find the last DEPLOYED revision
helm status my-app             # what state is it in now
kubectl describe pod <new>     # why did it actually fail
helm rollback my-app <n>       # back to a known-good revision
```

**The trap:** if the *first ever* install failed, there is no previous revision,
and `helm upgrade` then fails with `has no deployed releases`. You must
`helm uninstall` and install again.

**The prevention, and the real answer:**

```sh
helm upgrade --install my-app ./chart --atomic --wait --timeout 5m
```

`--wait` makes Helm block until resources are actually Ready rather than merely
accepted, and `--atomic` rolls back automatically on failure — so the cluster
is never left half-upgraded.

:::ar
**نصّ منشورة**، إلا لو استخدمت `--atomic`.

Helm بيطبّق الموارد بترتيب معيّن. فلو فشل عند المورد ١٢ من ٢٠، أول ١١
**موجودين شغالين**، والـ release متعلّم عليها `failed`.

```sh
helm history my-app       # آخر revision كانت DEPLOYED
kubectl describe pod <جديد>   # فشل ليه أصلاً
helm rollback my-app <n>
```

**والفخ:** لو **أول تنصيبة خالص** هي اللي فشلت، **مفيش revision قديمة
ترجعلها**، و `helm upgrade` بيقولك `has no deployed releases`. لازم
`helm uninstall` وتنصّب من الأول.

**والوقاية — وهي الإجابة الحقيقية:**

```sh
helm upgrade --install my-app ./chart --atomic --wait --timeout 5m
```

الـ `--wait` بتخلي Helm يستنى الموارد تبقى **Ready** فعلاً مش بس
**مقبولة**، والـ `--atomic` بترجّع لوحدها لو فشل — **فالكلاستر عمره
ما يفضل نص منشور**.
:::
:::

:::q Where does Helm store release state, and why does that matter?
In **Secrets in the release's namespace**, one per revision, named
`sh.helm.release.v1.<release>.v<n>` and containing a gzipped, base64-encoded
copy of the rendered manifests and the values used.

```sh
kubectl get secret -n <ns> -l owner=helm
helm get values my-app          # the values that were actually applied
helm get manifest my-app        # the YAML that was actually applied
```

Three consequences that matter operationally:

- **State lives in the cluster, not on your laptop.** Any machine with
  credentials sees the same history — which is what makes Helm usable from CI.
- **Lose the namespace, lose the history.** Deleting a namespace destroys the
  release records with it; `helm rollback` is then impossible.
- **Anyone who can read Secrets in that namespace can read your values** —
  including any password you passed with `--set`. This is the argument for
  keeping secrets out of values entirely and using a secret manager or
  External Secrets, with RBAC on the namespace.

:::ar
في **Secrets جوه نفس الـ namespace**، واحد لكل revision، اسمه
`sh.helm.release.v1.<release>.v<n>`، وجواه نسخة مضغوطة من الـ manifests
**والقيم اللي اتنشرت بيها**.

```sh
kubectl get secret -n <ns> -l owner=helm
helm get values my-app      # القيم اللي اتطبّقت فعلاً
helm get manifest my-app    # الـ YAML اللي اتطبّق فعلاً
```

**وتلات نتايج مهمة عملياً:**

1. **الحالة في الكلاستر مش على جهازك.** أي جهاز معاه صلاحيات بيشوف نفس
   التاريخ — **وعشان كده Helm بينفع من الـ CI**.

2. **تمسح الـ namespace، يضيع التاريخ.** ومعاه تضيع إمكانية الـ rollback
   نهائياً.

3. **أي حد يقدر يقرا الـ Secrets في الـ namespace دي يقدر يقرا قيمك** —
   **وده بيشمل أي باسورد بعتّه بـ `--set`**.

وده بالظبط سبب إنك **متحطش أسرار في الـ values خالص**، وتستخدم secret
manager أو External Secrets، **ومعاهم RBAC على الـ namespace**.
:::
:::

## Key takeaways

- **Helm is a templating engine plus a release ledger.** The ledger is the part
  `kubectl apply` cannot replace.
- **`helm template` renders without a cluster** — read third-party charts with
  it before you trust them, and debug your own with it.
- **`--atomic --wait` in CI, always.** Without them a failed upgrade leaves the
  release half-applied and reports success.
- **Pin the chart version** with `--version`, exactly as you pin image tags.
- **Release state is Secrets in the namespace** — so values are readable by
  anyone with Secret access, and deleting the namespace destroys the history.
- **`helm rollback` restores manifests, never data.** Migrations must still be
  backwards-compatible.
- **Kustomize for your apps, Helm for other people's** is a defensible default.

:::ar الخلاصة
1. **Helm = محرّك قوالب + سجل إصدارات.** والسجل هو الجزء اللي
   `kubectl apply` **مش قادر يعوّضه**.
2. **`helm template` بيرندر من غير كلاستر** — اقرا بيه charts الناس
   **قبل** ما تثق فيها، وظبّط بيه بتاعتك.
3. **`--atomic --wait` في الـ CI، دايماً.** من غيرهم الـ upgrade الفاشل
   **بيسيب الـ release نص منشورة وبيقول نجح**.
4. **ثبّت نسخة الـ chart** بـ `--version`، بالظبط زي ما بتثبّت تاجات الصور.
5. **حالة الإصدارات Secrets في الـ namespace** — يعني القيم **مقروءة**
   لأي حد عنده صلاحية، **ومسح الـ namespace بيضيّع التاريخ**.
6. **`helm rollback` بيرجّع الـ manifests، مش الداتا أبداً.** الـ
   migrations لازم تفضل متوافقة للخلف.
7. **Kustomize لتطبيقاتك، و Helm لبرامج الناس** — اختيار افتراضي محترم.
:::
