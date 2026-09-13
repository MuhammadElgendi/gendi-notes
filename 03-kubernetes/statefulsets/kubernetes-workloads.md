---
title: StatefulSets, DaemonSets and Jobs
slug: kubernetes-workloads
type: guide
domain: 03-kubernetes
tags: [kubernetes, workloads, statefulset]
keywords: [statefulset, daemonset, job, cronjob, replicaset, ordinal,
           headless service, volumeClaimTemplates, parallelism, backoffLimit,
           concurrencyPolicy, ستيتفول, دايمون, مهام, مجدولة]
level: 3
status: stable
prerequisites: [kubernetes-deployments, kubernetes-storage]
related: [kubernetes-deployments, kubernetes-storage, kubernetes-services,
          devops-interview-questions]
updated: 2026-09-13
---

# StatefulSets, DaemonSets and Jobs

> A Deployment assumes its pods are interchangeable. The other three workload types exist for the cases where they are not — because they have identity, because you need one per node, or because they are meant to finish.

## What is it?

Four controllers, each for a different assumption about the workload.

| Controller | Creates | Use for |
|:---|:---|:---|
| **Deployment** | N identical, disposable pods | Stateless apps. Most things |
| **StatefulSet** | N pods with **stable identity and storage** | Databases, queues, anything clustered |
| **DaemonSet** | **One pod per node** | Log shippers, metrics agents, CNI |
| **Job / CronJob** | Pods that **run to completion** | Migrations, batch, backups |

```diagram
   DEPLOYMENT            STATEFULSET           DAEMONSET           JOB
   ──────────            ───────────           ─────────           ───
   web-7d4f-a1b2         db-0                  node-1: agent       migrate-x9k
   web-7d4f-c3d4         db-1                  node-2: agent            │
   web-7d4f-e5f6         db-2                  node-3: agent            ↓
                                                                   completes,
   random names          STABLE names          follows nodes       then stops
   any order             ordered 0,1,2         automatically
   shared or no PVC      PVC PER POD           usually hostPath
```

:::ar
أربع كنترولرز، وكل واحد مبني على **افتراض مختلف** عن شغلك.

| الكنترولر | بيعمل إيه | تستخدمه لإيه |
|:---|:---|:---|
| **Deployment** | N بودات **متطابقة وقابلة للاستبدال** | تطبيقات من غير حالة. **أغلب الحاجات** |
| **StatefulSet** | N بودات **بهوية وتخزين ثابتين** | داتابيزات، طوابير، أي حاجة عنقودية |
| **DaemonSet** | **بود واحد على كل نود** | جامع لوجز، وكيل مقاييس، CNI |
| **Job / CronJob** | بودات **بتخلص وتقف** | migrations، شغل دفعات، باك أب |

**والفرق الجوهري في كلمة واحدة: الافتراض.**

الـ **Deployment** بيفترض إن البودات **مالهاش هوية** — أي واحدة زي التانية،
ومش مهم مين يموت ومين يقوم، ولا مهم الترتيب.

**ولما الافتراض ده يبقى غلط، إنت محتاج نوع تاني.** والتلاتة التانيين
موجودين عشان التلات حالات اللي الافتراض بيتكسر فيها:

1. **البودات ليها هوية** (البود ده هو الـ primary) ← StatefulSet
2. **عايز واحد على كل ماكينة** ← DaemonSet
3. **الشغل بيخلص** مش بيفضل شغال ← Job
:::

## StatefulSet

### What it guarantees

```diagram
   DEPLOYMENT                       STATEFULSET
   ──────────                       ───────────
   name: web-7d4f9c-a1b2            name: db-0, db-1, db-2   ← stable, ordinal
   dies → new random name           dies → comes back as db-1 exactly
   all start at once                starts 0, then 1, then 2  ← ordered
   scale down: random pod           scale down: highest ordinal first
   one shared PVC (or none)         db-0 → data-db-0          ← PVC per pod
                                    db-1 → data-db-1
   no per-pod DNS                   db-0.mysvc.ns.svc.cluster.local
```

```yaml title="statefulset.yaml"
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db }
spec:
  serviceName: db-headless          # REQUIRED, and must be a headless Service
  replicas: 3
  selector:
    matchLabels: { app: db }
  template:
    metadata:
      labels: { app: db }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: postgres
          image: postgres:17
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:             # creates ONE PVC PER POD
    - metadata: { name: data }
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: gp3
        resources: { requests: { storage: 100Gi } }
---
apiVersion: v1
kind: Service
metadata: { name: db-headless }
spec:
  clusterIP: None                   # headless → per-pod DNS records
  selector: { app: db }
  ports: [{ port: 5432 }]
```

:::key The headless Service is what gives each pod an address
`clusterIP: None` makes DNS return the **pod IPs** instead of one virtual IP,
and gives every pod its own name:

```text
db-0.db-headless.default.svc.cluster.local
db-1.db-headless.default.svc.cluster.local
```

That is the whole point. A replica set needs to say "connect to `db-0`, it is
the primary" — which a normal Service, that load-balances across all of them,
can never express.
:::

:::warn `volumeClaimTemplates` PVCs are not deleted with the StatefulSet
Deleting a StatefulSet leaves its PVCs behind, deliberately — so that recreating
it reattaches the same data.

It is a good default that surprises people twice: your "cleanup" leaves disks
billing, and scaling down from 5 to 3 leaves `data-db-3` and `data-db-4`
waiting. Scale back up and they are reused, which is usually what you want.

```sh
kubectl get pvc -l app=db     # check before assuming a namespace is clean
```
:::

:::ar الـ StatefulSet — إيه اللي بتضمنه
| | Deployment | StatefulSet |
|:---|:---|:---|
| الأسماء | **عشوائية** | **ثابتة ومرقّمة**: `db-0`، `db-1` |
| البدء | كلهم مع بعض | **بالترتيب**: ٠ وبعدين ١ وبعدين ٢ |
| التصغير | بود عشوائي | **الرقم الأعلى الأول** |
| التخزين | مشترك أو مفيش | **PVC لكل بود** |
| الـ DNS | للمجموعة | **اسم لكل بود** |

**والـ headless Service هي اللي بتدي كل بود عنوان.**

لما تكتب `clusterIP: None`، الـ DNS **بيرجّع IPs البودات نفسها** بدل
عنوان وهمي واحد، **وبيدي كل بود اسم**:

```text
db-0.db-headless.default.svc.cluster.local
```

**وهي دي كل الفايدة.** الداتابيز العنقودية محتاجة تقول «اتصل بـ `db-0`،
هو الـ primary» — **والـ Service العادي اللي بيوزّع على الكل عمره ما
هيعرف يعبّر عن ده**.

:::warn والـ PVCs **مش بتتمسح** مع الـ StatefulSet
لما تمسح StatefulSet، الـ PVCs بتاعتها **بتفضل** — **وده بقصد**، عشان
لو عملتها تاني **ترجع تلاقي نفس الداتا**.

**وده افتراضي كويس بيفاجئ الناس مرتين:**

1. «التنضيف» بتاعك **ساب ديساكات بتتحاسب عليها**
2. **التصغير من ٥ لـ ٣ بيسيب `data-db-3` و `data-db-4`** مستنيين

**ولو كبّرت تاني، بيتعاد استخدامهم** — **وده غالباً اللي إنت عايزه فعلاً**.

```sh
kubectl get pvc -l app=db      # شيك قبل ما تفترض إن الـ namespace نضيفة
```
:::
:::

## DaemonSet

One pod per node, automatically — including on nodes that join later.

```yaml title="daemonset.yaml"
apiVersion: apps/v1
kind: DaemonSet
metadata: { name: log-agent }
spec:
  selector:
    matchLabels: { app: log-agent }
  template:
    metadata:
      labels: { app: log-agent }
    spec:
      # Run on control-plane nodes too, which are usually tainted
      tolerations:
        - operator: Exists
      containers:
        - name: agent
          image: fluent-bit:3.1
          resources:
            limits: { memory: 200Mi }     # it runs EVERYWHERE — cap it
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
      volumes:
        - name: varlog
          hostPath: { path: /var/log }
```

| Use for | Why a DaemonSet |
|:---|:---|
| Log collection | Must read `/var/log` on **every** node |
| Metrics agents | node-exporter measures the node itself |
| CNI / kube-proxy | Networking must exist on every node |
| Storage drivers | CSI node plugins mount volumes locally |

:::warn A DaemonSet multiplies by your node count
A 200 MiB agent on 100 nodes is 20 GiB of cluster memory, and it scales with
the cluster rather than with traffic. Two consequences:

- **Always set resource limits.** A leaking DaemonSet takes down every node at
  once, which is the worst possible failure shape.
- **Tolerations are usually required.** Control-plane nodes are tainted, so
  without `tolerations` your monitoring agent silently skips exactly the nodes
  you most want to monitor.
:::

:::ar الـ DaemonSet
**بود واحد على كل نود، تلقائياً** — **وبيشمل النودات اللي هتنضم بعدين**.

| تستخدمها لإيه | ليه DaemonSet بالذات |
|:---|:---|
| جمع اللوجز | لازم يقرا `/var/log` على **كل** نود |
| وكلاء المقاييس | بيقيسوا **النود نفسها** |
| CNI و kube-proxy | الشبكة لازم تكون على كل نود |
| drivers التخزين | بيركّبوا الـ volumes محلياً |

:::danger والـ DaemonSet **بيتضرب في عدد النودات**
وكيل بياخد ٢٠٠ ميجا على **١٠٠ نود** = **٢٠ جيجا** من رام الكلاستر.
**وبيكبر مع حجم الكلاستر، مش مع الترافيك.**

**ونتيجتين:**

**١. حُط `limits` دايماً.** الـ DaemonSet اللي فيه تسريب رام **بيوقّع
كل النودات في نفس الوقت** — **وده أوحش شكل ممكن للعطل**، عشان مفيش
نود سليمة تستقبل الشغل.

**٢. الـ `tolerations` شبه إلزامية.** نودات الـ control plane عليها
**taints**، فمن غير tolerations وكيل المراقبة بتاعك **بيتخطّى بالظبط
النودات اللي إنت عايز تراقبها أكتر حاجة** — **وفي سكوت**.
:::
:::

## Job and CronJob

```yaml title="job.yaml"
apiVersion: batch/v1
kind: Job
metadata: { name: migrate }
spec:
  backoffLimit: 3           # retries before marking Failed
  completions: 1            # how many successful pods are needed
  parallelism: 1            # how many may run at once
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 3600   # auto-delete, or Jobs accumulate forever
  template:
    spec:
      restartPolicy: OnFailure    # Never or OnFailure. NOT Always
      containers:
        - name: migrate
          image: myapp:1.4.2
          command: ["./migrate.sh"]
```

```yaml title="cronjob.yaml"
apiVersion: batch/v1
kind: CronJob
metadata: { name: backup }
spec:
  schedule: "0 2 * * *"           # 02:00 — in the CONTROLLER's timezone
  timeZone: "Africa/Cairo"        # 1.27+. Set it explicitly
  concurrencyPolicy: Forbid       # do not start if the last one still runs
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: backup:1.0
```

| Field | Why it matters |
|:---|:---|
| `restartPolicy` | **`Always` is invalid** — a Job is meant to end |
| `backoffLimit` | Default 6, with exponential backoff |
| `ttlSecondsAfterFinished` | Without it, finished Jobs pile up until etcd suffers |
| `concurrencyPolicy` | `Allow` (default), `Forbid`, `Replace` |
| `timeZone` | Otherwise it is the controller's zone, which is usually UTC |

:::danger `concurrencyPolicy: Allow` is the default, and it overlaps runs
A backup scheduled hourly that starts taking 90 minutes will, by default, run
**two at once** — then three. They compete for the same database and the same
disk, each gets slower, and the overlap grows until something falls over.

The failure looks like "the database got slow at night" and takes a long time
to attribute.

```yaml
concurrencyPolicy: Forbid      # skip this run if the last is still going
```

Use `Forbid` for anything that touches shared state, and alert on skipped runs
— otherwise a job that never finishes becomes a job that never runs, silently.
:::

:::ar الـ Job والـ CronJob
| الحقل | ليه مهم |
|:---|:---|
| `restartPolicy` | **`Always` غير صالحة** — الـ Job المفروض تخلص |
| `backoffLimit` | الافتراضي ٦ محاولات |
| `ttlSecondsAfterFinished` | **من غيرها الـ Jobs بتتكوّم** لحد ما etcd تتعب |
| `concurrencyPolicy` | `Allow` (افتراضي) أو `Forbid` أو `Replace` |
| `timeZone` | من غيرها بيستخدم توقيت الكنترولر، **وغالباً UTC** |

:::danger و `concurrencyPolicy: Allow` هي الافتراضي، **وبتخلي التشغيلات تتداخل**
سيناريو حقيقي: باك أب بيشتغل كل ساعة، وبدأ ياخد **٩٠ دقيقة**.

**النتيجة الافتراضية: اتنين بيشتغلوا مع بعض.** وبعدين تلاتة.

وكلهم بيتخانقوا على **نفس الداتابيز ونفس الديسك**، فكل واحد بيبقى أبطأ،
**والتداخل بيكبر** لحد ما حاجة تقع.

**والعَرَض بيبان «الداتابيز بقت بطيئة بالليل»** — وبياخد وقت طويل
عشان حد يربطها بالسبب.

```yaml
concurrencyPolicy: Forbid     # متبدأش لو اللي قبله لسه شغّال
```

**استخدم `Forbid` لأي حاجة بتلمس حالة مشتركة.**

**وحُط تنبيه على التشغيلات اللي بتتخطّى** — عشان الـ job اللي عمره ما
بيخلص **بيبقى job عمره ما بيشتغل**، **في سكوت**.
:::
:::

## What goes wrong

| Symptom | Controller | Cause |
|:---|:---|:---|
| `db-1` never starts | StatefulSet | `db-0` is not Ready — startup is **ordered** |
| PVCs remain after delete | StatefulSet | By design; delete them explicitly |
| DaemonSet skips some nodes | DaemonSet | Node taints without matching tolerations |
| Every node OOMs at once | DaemonSet | No memory limit on the agent |
| Job reruns forever | Job | `restartPolicy: Always`, or `backoffLimit` too high |
| CronJobs pile up | CronJob | No `ttlSecondsAfterFinished` or history limits |
| Two backups at once | CronJob | `concurrencyPolicy: Allow` |
| CronJob skipped a run | CronJob | Missed `startingDeadlineSeconds` while the controller was down |

:::warn A StatefulSet rolls one pod at a time, and stops on failure
Ordered updates mean a bad image blocks the rollout at the **first** pod. That
feels broken and is protective: it stops you breaking every database replica.

```sh
kubectl rollout status statefulset/db
kubectl delete pod db-0        # after fixing, force the stuck pod to retry
```

`podManagementPolicy: Parallel` disables ordering for startup and scaling — use
it only when the members genuinely do not need to come up in order.
:::

:::ar المشاكل الشائعة
| العَرَض | الكنترولر | السبب |
|:---|:---|:---|
| `db-1` عمره ما بيبدأ | StatefulSet | **`db-0` مش Ready** — البدء **بالترتيب** |
| الـ PVCs فاضلة بعد المسح | StatefulSet | **بقصد**. امسحها بإيدك |
| الـ DaemonSet بيتخطّى نودات | DaemonSet | **taints** من غير tolerations |
| كل النودات بتعمل OOM مع بعض | DaemonSet | **مفيش حد رام** على الوكيل |
| الـ Job بيعيد للأبد | Job | `restartPolicy: Always` |
| الـ Jobs بتتكوّم | CronJob | مفيش `ttlSecondsAfterFinished` |
| باك أبين مع بعض | CronJob | `concurrencyPolicy: Allow` |

:::warn والـ StatefulSet بيحدّث **بود واحد في المرة، وبيقف لو فشل**
التحديث المرتّب معناه إن **صورة باظت بتوقّف التحديث عند أول بود**.

**وده شكله عطل، وهو حماية:** بيمنعك إنك **تبوّظ كل نسخ الداتابيز**.

```sh
kubectl rollout status statefulset/db
kubectl delete pod db-0        # بعد ما تصلّح، اجبر البود المعلّق يعيد المحاولة
```
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q When would you use a StatefulSet instead of a Deployment?
When the pods are **not interchangeable** — when something depends on *which*
pod it is. Three guarantees a Deployment cannot give:

| Guarantee | Why it matters |
|:---|:---|
| **Stable network identity** | `db-0` is always `db-0`. Replicas configure "replicate from `db-0`" |
| **Stable storage** | `db-1` always reattaches `data-db-1`, not someone else's data |
| **Ordered, one-at-a-time operations** | A quorum system must not restart all members at once |

Concretely: PostgreSQL with replicas, Kafka, Elasticsearch, ZooKeeper, etcd —
anything where members know about each other.

**And the honest counter-argument, worth volunteering:** a StatefulSet gives
you identity and storage, but it does **not** make an application clustered. It
will not elect a leader, replicate data, or rejoin a split brain. That logic is
the application's, and for production databases an **operator** — or a managed
service — is usually the right answer rather than a hand-written StatefulSet.

:::ar
**لما البودات مش قابلة للاستبدال** — لما يكون فيه حاجة معتمدة على
**أنهي بود** ده بالظبط. وتلات ضمانات الـ Deployment **مش قادر** يديهالك:

| الضمان | ليه بيفرق |
|:---|:---|
| **هوية شبكة ثابتة** | `db-0` دايماً `db-0`. النسخ بتتظبّط على «انسخ من `db-0`» |
| **تخزين ثابت** | `db-1` بيرجع لـ `data-db-1`، **مش لداتا حد تاني** |
| **عمليات مرتّبة واحدة واحدة** | نظام الأغلبية **ممنوع** كل أعضاؤه يقوموا مع بعض |

**عملياً:** بوستجرس بنسخ، وكافكا، وإلاستيك، و ZooKeeper، و etcd — **أي
حاجة أعضاؤها عارفين بعض**.

**والحجة المضادة الأمينة، وقولها من نفسك:**

الـ StatefulSet بيديك **هوية وتخزين**، **بس هو مش بيخلي التطبيق عنقودي**.

**هو مش هينتخب leader، ولا هينسخ داتا، ولا هيحل split brain.** المنطق
ده **بتاع التطبيق نفسه**.

**وللداتابيزات في البرودكشن، الـ operator — أو خدمة مُدارة — غالباً
هو الصح**، مش StatefulSet مكتوبة بالإيد.
:::
:::

:::q A CronJob's backups start overlapping. What happened and how do you fix it?
The job now takes longer than its schedule interval, and the default
`concurrencyPolicy: Allow` lets a new run start while the old one is going.

```diagram
   schedule: hourly, runtime grew to 90 minutes

   10:00 ████████████████ 11:30
   11:00       ████████████████ 12:30    ← two at once
   12:00             ████████████████    ← three, and accelerating
                     │
                     └─ all hammering the same database
```

**The fix is one field:**

```yaml
concurrencyPolicy: Forbid     # or Replace, if the newest run is the useful one
```

**But the fix alone is not the answer** — with `Forbid`, runs are now *skipped*
instead of overlapping, which is quieter and can mean backups silently stop
happening. So you also need:

- **Alerting on job age**: if the last successful completion is older than two
  intervals, page someone.
- **`activeDeadlineSeconds`** so a hung run cannot block every subsequent one
  indefinitely.
- **Investigate the growth.** A backup that grew from 20 to 90 minutes is
  telling you something about data volume that will not stop growing.

:::key
Naming the second-order failure — "`Forbid` converts overlap into silent
skipping, so I would alert on last-success age" — is the part that separates a
config answer from an operational one.
:::

:::ar
الـ job بقى بياخد وقت أطول من الفاصل بين التشغيلات، **والافتراضي
`Allow` بيسمح لواحد جديد يبدأ والقديم لسه شغّال**.

**والحل حقل واحد:**

```yaml
concurrencyPolicy: Forbid      # أو Replace لو الأحدث هو المفيد
```

**بس الحل لوحده مش الإجابة.**

مع `Forbid`، التشغيلات بقت **بتتخطّى** بدل ما تتداخل — **وده أهدى،
ومعناه إن الباك أب ممكن يبطّل يحصل في سكوت**.

**فإنت محتاج كمان:**

1. **تنبيه على عمر آخر نجاح** — لو آخر باك أب ناجح أقدم من فاصلين،
   **اتصل بحد**.
2. **`activeDeadlineSeconds`** عشان تشغيلة معلّقة **متقفلش** كل اللي بعدها
   للأبد.
3. **حقّق في سبب النمو نفسه.** باك أب طلع من ٢٠ لـ ٩٠ دقيقة **بيقولك
   حاجة عن حجم الداتا مش هتبطّل تكبر**.

**وإنك تسمّي الفشل من الدرجة التانية** — «الـ `Forbid` بتحوّل التداخل
لتخطّي صامت، فأنا هحط تنبيه على عمر آخر نجاح» — **ده اللي بيفرّق بين
إجابة إعدادات وإجابة تشغيل**.
:::
:::

## Key takeaways

- **Deployment for stateless, StatefulSet for identity, DaemonSet for per-node,
  Job for work that ends.**
- **StatefulSets give identity and storage, not clustering.** The application
  still has to know how to be a cluster.
- **A headless Service is required** for per-pod DNS.
- **`volumeClaimTemplates` PVCs survive deletion** — deliberately, and
  expensively if forgotten.
- **DaemonSets need limits and tolerations**, or they OOM every node or skip
  the control plane.
- **`restartPolicy: Always` is invalid in a Job**, and `ttlSecondsAfterFinished`
  stops them accumulating.
- **`concurrencyPolicy: Forbid`** for anything touching shared state — then
  alert on skipped runs.

:::ar الخلاصة
1. **Deployment للي من غير حالة، StatefulSet للهوية، DaemonSet لكل نود،
   Job للشغل اللي بيخلص.**
2. **الـ StatefulSet بيدي هوية وتخزين، مش عنقدة.** التطبيق **لسه لازم
   يعرف يبقى كلاستر بنفسه**.
3. **الـ headless Service إجبارية** عشان DNS لكل بود.
4. **PVCs الـ `volumeClaimTemplates` بتعيش بعد المسح** — **بقصد**،
   **وبفلوس** لو نسيتها.
5. **الـ DaemonSets محتاجة `limits` و `tolerations`**، وإلا **بتوقّع كل
   النودات** أو **بتتخطّى الـ control plane**.
6. **`restartPolicy: Always` غير صالحة في Job**، و `ttlSecondsAfterFinished`
   بتمنع التكوّم.
7. **`concurrencyPolicy: Forbid`** لأي حاجة بتلمس حالة مشتركة — **وبعدين
   نبّه على التشغيلات المتخطّاة**.
:::
