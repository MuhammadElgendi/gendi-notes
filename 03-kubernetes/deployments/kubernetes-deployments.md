---
title: Kubernetes Deployments
slug: kubernetes-deployments
type: guide
domain: 03-kubernetes
tags: [kubernetes, deployments, rollout]
keywords: [replicaset, rolling update, rollback, scale, replicas, strategy,
           hpa, autoscaling, readiness, liveness, startupprobe, prestop, pdb,
           ديبلويمنت, تحديث, نشر, رول باك]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-services, kubernetes-troubleshooting,
          devops-interview-questions]
updated: 2026-09-08
---

# Kubernetes Deployments

> A Deployment is how you get zero-downtime updates: it never edits a running pod, it creates new ones and removes old ones in a controlled order.

## What is it?

A Deployment keeps a set number of identical pods running, and manages the
transition when you change them. It is the object you use for any stateless
application — web servers, APIs, workers.

You do not create pods yourself. You create a Deployment; it does the rest.

## Why it exists

A bare pod has no safety net. Delete it and it is gone. A Deployment adds:

- **Self-healing** — a pod dies, a replacement appears
- **Scaling** — one command changes the replica count
- **Rolling updates** — new version phased in without dropping traffic
- **Rollback** — one command returns to the previous version

## What it is made of

Three layers, and knowing them makes rollbacks make sense:

```diagram
   Deployment  "run 3 pods of nginx:1.27, update them safely"
        │
        │ creates and owns one ReplicaSet per version
        ↓
   ReplicaSet (nginx:1.27)  "keep exactly 3 pods alive"
        │
        ↓
   Pod   Pod   Pod
```

When you change the image, the Deployment creates a **new** ReplicaSet and
shrinks the old one:

```diagram
   during a rolling update:

   ReplicaSet v1 (old)  ███░░░░  3 → 2 → 1 → 0
   ReplicaSet v2 (new)  ░░░████  0 → 1 → 2 → 3
                        └─ both exist at once, briefly
```

:::key Old ReplicaSets are kept deliberately
After a successful update the old ReplicaSet stays, scaled to 0. That is not
leftover rubbish — it is what makes `kubectl rollout undo` instant. Rolling back
just scales the old ReplicaSet up and the new one down.

`kubectl get rs` shows them. `revisionHistoryLimit` (default 10) controls how
many are kept.
:::

:::ar تلات طبقات، وفهمهم بيفسّر الـ rollback
```diagram
   Deployment      "شغّلي ٣ بودات nginx:1.27، وحدّثهم بأمان"
        │
        │  بتعمل ReplicaSet لكل إصدار
        ↓
   ReplicaSet      "خلّي عندي ٣ بودات بالظبط، لا أكتر ولا أقل"
        │
        ↓
   Pod   Pod   Pod
```

يعني إنت بتكلّم الـ **Deployment**، وهي بتكلّم الـ **ReplicaSet**، وهي
اللي بتعمل الـ **Pods**. تلات طبقات، كل واحدة شغلتها واضحة:

| الطبقة | مسؤولة عن إيه |
|:---|:---|
| **Deployment** | التحديثات والرجوع للخلف. **بتفكّر في الإصدارات** |
| **ReplicaSet** | العدد. **بتفكّر في الرقم بس** |
| **Pod** | إنه يشتغل |

**ولما تغيّر الصورة إيه اللي بيحصل؟** الـ Deployment **مش** بتعدّل البودات
الموجودة. هي بتعمل **ReplicaSet جديدة خالص** وتصغّر القديمة بالراحة:

```diagram
   خلال الـ rolling update:

   ReplicaSet v1 (القديمة)  ███░░░░   ٣ ← ٢ ← ١ ← ٠
   ReplicaSet v2 (الجديدة)  ░░░████   ٠ → ١ → ٢ → ٣
                            └─ الاتنين موجودين مع بعض، لفترة قصيرة
```

:::key وعشان كده الـ rollback بياخد ثانية
بعد ما التحديث ينجح، **الـ ReplicaSet القديمة بتفضل موجودة**، بس بـ ٠ بودات.

ودي **مش زبالة متسيبة**. دي بالظبط اللي بتخلي `kubectl rollout undo`
لحظي — عشان الرجوع للخلف مش بيبني حاجة من الأول، هو بس **بيكبّر القديمة
ويصغّر الجديدة**.

```sh
kubectl get rs -l app=web     # هتلاقي القديمة بـ 0 والجديدة بـ 3
```

والعدد المحفوظ منهم بيتحكم فيه `revisionHistoryLimit` (الافتراضي ١٠).
:::
:::

## How to use it

```yaml title="deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1      # how many may be down during the update
      maxSurge: 1            # how many extra may exist temporarily
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          readinessProbe:              # "may I receive traffic?"
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:               # "should I be restarted?"
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests: { memory: "64Mi", cpu: "100m" }
            limits:   { memory: "128Mi", cpu: "500m" }
```

### Commands

```sh
kubectl apply -f deployment.yaml

kubectl rollout status deploy/web        # watch the update; exits when done
kubectl get rs -l app=web                # the ReplicaSets, old and new
kubectl rollout history deploy/web       # revision list

kubectl set image deploy/web web=nginx:1.28-alpine   # trigger an update
kubectl scale deploy/web --replicas=5

kubectl rollout undo deploy/web              # back one revision
kubectl rollout undo deploy/web --to-revision=3

kubectl rollout restart deploy/web       # recreate all pods without changing the spec
```

`kubectl rollout restart` is the way to make pods pick up a changed ConfigMap or
Secret — it recreates them with no spec change.

### Probes are the part that actually matters

The two probes look similar and do very different things. Getting them wrong is
the most common cause of self-inflicted outages.

| | **readinessProbe** | **livenessProbe** |
|:---|:---|:---|
| Question | "Can I serve traffic?" | "Am I broken beyond recovery?" |
| On failure | Removed from the Service — **no restart** | **Container is restarted** |
| Use for | Warm-up, temporary overload | Deadlock, unrecoverable state |

:::danger A liveness probe turns a slowdown into an outage
Your service gets busy. Response times rise. The liveness probe times out.
Kubernetes restarts the container — removing capacity from an already-overloaded
service, which makes the remaining pods busier, which fails their probes too.

The cascade is entirely self-inflicted.

Two rules that prevent it:
- **Liveness endpoints must check only the process**, never a database or
  another service. A liveness check that pings the database restarts your app
  every time the database hiccups.
- Give liveness generous timeouts. Readiness is where you want to be strict.

If your app is simply slow to start, use a **startupProbe** — it suspends
liveness until the app is up, instead of you having to loosen liveness forever.
:::

:::ar الـ probes دي أخطر حاجة في الملف كله
التلاتة شكلهم متشابه، وبيعملوا حاجات مختلفة تماماً. وغلطة هنا **بتوقّع
الموقع بإيدك إنت**، مش بسبب عطل.

| | `readinessProbe` | `livenessProbe` | `startupProbe` |
|:---|:---|:---|:---|
| السؤال | «أقدر أستقبل ترافيك؟» | «أنا معلّق ومفيش أمل؟» | «أنا لسه بقوم؟» |
| لو فشلت | **بتتشال من الـ Service** | **الكونتينر بيتقتل ويرجع** | بتوقّف التانيين |
| بتموت؟ | **لأ** | **أيوه** | لأ |
| بتستخدمها لـ | تسخين، حمل مؤقت | قفلة حقيقية | تطبيق بطيء في القيام |

**افهم الفرق بجملة واحدة:**

> `readiness` بتقول **«شيلوني من الطابور شوية»**.
> `liveness` بتقول **«اقتلوني وابدأوا من الأول»**.

:::danger الـ liveness probe بتحوّل البطء لانقطاع كامل
دي أهم حاجة في الصفحة. اقراها مرتين.

```diagram
   السيرفيس بيزحم
        ↓
   وقت الرد بيزيد
        ↓
   الـ liveness probe بتعمل timeout
        ↓
   كوبرنيتيس بيقتل الكونتينر ويرجّعه
        ↓
   قدرة أقل على سيرفيس أصلاً مزنوق
        ↓
   البودات الباقية بتزحم أكتر
        ↓
   الـ probes بتاعتهم بتفشل كمان
        ↓
   ═══ الأسطول كله بيقعد يعمل restart في حلقة ═══
```

**والانقطاع ده مفيش حد عمله غيرك.** مفيش عطل، مفيش هجوم. إنت بإيدك
حوّلت «الموقع بطيء» لـ «الموقع واقع».

**وقاعدتين بيمنعوا ده تماماً:**

**١. الـ liveness لازم تشيك على العملية بس، وخلاص.** ممنوع تشيك على
داتابيز ولا على سيرفيس تاني. الـ liveness اللي بتضرب ping للداتابيز
**بتعمل restart لتطبيقك كل مرة الداتابيز تتعثّر**.

**٢. إدي الـ liveness مهلة كريمة.** الشدّة والحسم مكانهم في الـ readiness،
عشان دي بتشيل من الطابور وبس. الـ liveness بتقتل.

**ولو تطبيقك بطيء في القيام** (JVM، أو migrations كبيرة)، **متوسّعش
الـ liveness** — استخدم **`startupProbe`**. هي بتعلّق الـ liveness لحد
ما التطبيق يقوم، وبعدها الـ liveness ترجع بشدّتها الطبيعية. كده إنت
بتحل مشكلة الإقلاع من غير ما تفقد الحماية للأبد.
:::
:::

### Rolling update knobs

```diagram
   replicas: 10, maxUnavailable: 1, maxSurge: 1

   ┌─ at most 11 pods exist at any moment  (10 + maxSurge)
   └─ at least 9 are serving               (10 − maxUnavailable)

   maxUnavailable: 0  → never lose capacity, but needs room for extra pods
   maxSurge: 0        → never exceed the count, but capacity dips during update
```

Setting both to 0 is invalid — nothing could ever change.

:::ar
الرقمين دول بيتحكموا في التحديث كله، وفهمهم بسيط:

```diagram
   replicas: 10,  maxUnavailable: 1,  maxSurge: 1

   maxSurge: 1        →  مسموح يبقى فيه ١١ بود بالكتير (١٠ + ١)
                          يعني «اسمحلي أعمل زيادة مؤقتة»

   maxUnavailable: 1  →  لازم يفضل ٩ بودات شغالين على الأقل (١٠ − ١)
                          يعني «اسمحلي أقفل واحد بالكتير»
```

| الإعداد | معناه | التنازل |
|:---|:---|:---|
| `maxUnavailable: 0` | عمرك ما تفقد قدرة | محتاج مساحة لبودات زيادة |
| `maxSurge: 0` | عمرك ما تزيد العدد | القدرة بتقل وقت التحديث |
| الاتنين `0` | **غير صالح** | مفيش أي حاجة تقدر تتغير خالص |

**اللي تختاره في البرودكشن:** `maxUnavailable: 0` و `maxSurge: 1` (أو أكتر).
يعني «اعمل الجديد الأول، وبعد ما يبقى Ready اقفل القديم». كده القدرة
عمرها ما بتقل — بس لازم يكون في الكلاستر مساحة للبود الزيادة.

**والاختيار الغلط الشائع:** الناس بتسيب الافتراضي (٢٥٪ و ٢٥٪)، فوقت
التحديث ربع الأسطول بيقفل. ولو إنت أصلاً شغّال على الحد، دي بتوجعك.
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `rollout status` hangs forever | New pods never become Ready | `kubectl describe pod` on a new pod |
| Old pods never terminate | A `PodDisruptionBudget` blocks eviction | `kubectl get pdb` |
| Update did nothing | The spec did not actually change | Use `rollout restart`, or change the tag |
| Pods restart in a loop after deploy | Liveness probe failing | Check the probe path, port, and timing |
| A few 502s on every deploy | Endpoints not updated before the pod dies | See below |

:::warn A few errors on every rolling update — and how to stop them
When a pod is being removed, two things happen **in parallel, not in order**:
kubelet sends SIGTERM to your app, and the Service's endpoint list is updated
across every node.

There is no coordination. Your app can finish shutting down before the last node
stops sending it traffic — so requests arrive at a closed socket.

The fix is a `preStop` hook that delays the shutdown, giving endpoint removal
time to propagate:

```yaml
lifecycle:
  preStop:
    exec:
      # The pod is already out of the endpoint list; this pause lets every
      # node's networking catch up before the process exits.
      command: ["sh", "-c", "sleep 10"]
```

A longer `terminationGracePeriodSeconds` does **not** fix this — it extends how
long the app may take to exit, which is the wrong side of the race.
:::

## Scaling automatically

```sh
# Add and remove pods based on CPU. Requires resource requests to be set
# and the metrics-server add-on to be installed.
kubectl autoscale deploy/web --min=3 --max=10 --cpu-percent=70
kubectl get hpa
```

The HPA needs `resources.requests` — the target percentage is measured against
the request, so with no request there is nothing to compute against.

:::ar
الـ **HPA** (Horizontal Pod Autoscaler) بيزوّد وينقّص البودات لوحده على
حسب الحمل.

```sh
kubectl autoscale deploy/web --min=3 --max=10 --cpu-percent=70
kubectl get hpa
```

**بس فيه شرطين لازم يتحققوا، وإلا مش هيشتغل:**

1. **لازم تكون كاتب `resources.requests`.** النسبة (٧٠٪) بتتقاس **مقابل
   الـ request** — فلو مفيش request، مفيش حاجة يحسب عليها، والـ HPA
   بيقعد يكتب `<unknown>` ومش بيعمل حاجة.

2. **لازم `metrics-server` يكون منصّب** في الكلاستر. من غيره مفيش أرقام
   توصل للـ HPA أصلاً.

:::warn والـ HPA مش بيحل مشكلة إنك مش عندك سيرفرات
دي لخبطة مهمة: الـ HPA بيعمل **بودات** جديدة. لو مفيش نود فيها مكان،
البودات الجديدة بتقعد `Pending` وخلاص.

اللي بيزوّد **السيرفرات** حاجة تانية اسمها **Cluster Autoscaler** (أو
Karpenter). والاتنين لازم يشتغلوا مع بعض:

```diagram
   الحمل زاد
      ↓
   HPA  →  بيعمل بودات جديدة
      ↓
   مفيش مكان؟  →  البودات Pending
      ↓
   Cluster Autoscaler  →  بيضيف نود جديدة
      ↓
   الـ Scheduler بيحط البودات عليها
```

فلو شوفت `Pending` بعد ما الـ HPA اشتغل، المشكلة مش في الـ HPA.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is the difference between a readiness and a liveness probe, and how would you break production with them?
Readiness answers "can I serve traffic **right now**?" — failing removes the
pod from the Service, and nothing is restarted. Liveness answers "am I
wedged?" — failing **restarts the container**.

**How to break production, in one config:**

```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }   # and /health checks the database
```

Now the database has a two-second blip. Every pod's `/health` fails. Every
pod fails liveness. Kubernetes restarts your **entire fleet** at once — and
the restarted pods all reconnect to the already-struggling database
simultaneously.

You converted a recoverable dependency blip into a full outage plus a
thundering herd.

| Rule | Why |
|:---|:---|
| Liveness checks **only the process** | A dependency check makes their outage your outage |
| Liveness gets **generous** timeouts | It kills; strictness belongs in readiness |
| Slow start → `startupProbe` | Suspends liveness during boot instead of loosening it forever |

:::ar
الـ readiness بتجاوب «أقدر أستقبل ترافيك **دلوقتي**؟» — لو فشلت البود
بيتشال من الـ Service **ومفيش حاجة بتموت**.

والـ liveness بتجاوب «أنا معلّق؟» — لو فشلت **الكونتينر بيتقتل ويرجع**.

**وإزاي توقّع البرودكشن بإعداد واحد؟**

تحط `livenessProbe` على `/health`، و `/health` بتشيك على الداتابيز.

الداتابيز تتعثّر ثانيتين. كل البودات تفشل. كوبرنيتيس يعمل **restart
للأسطول كله في نفس اللحظة**. والبودات اللي رجعت كلها تحاول تتصل
بالداتابيز المزنوقة أصلاً في نفس الوقت.

**النتيجة:** حوّلت تعثّر مؤقت لانقطاع كامل، وزوّدت عليه موجة اتصالات
بتخنق الداتابيز أكتر.

| القاعدة | ليه |
|:---|:---|
| الـ liveness تشيك **العملية بس** | لو شيكت dependency، عطلهم يبقى عطلك |
| الـ liveness مهلتها **كريمة** | هي بتقتل. الشدّة مكانها في الـ readiness |
| بطيء في القيام؟ `startupProbe` | بتعلّق الـ liveness وقت الإقلاع بدل ما توسّعها للأبد |
:::
:::

:::q `kubectl rollout status` hangs forever. The new pods look fine to you. Debug it.
"Look fine" is the trap — `rollout status` waits for **Ready**, not for
Running, and it will wait forever by design rather than declare a bad
version healthy.

```sh
# 1. Which pod belongs to the NEW ReplicaSet?
kubectl get rs -l app=web           # find the one scaling up
kubectl get pods -l app=web

# 2. Why is that pod not Ready? The Events say so.
kubectl describe pod <new-pod>      # probe failures, image pull, scheduling

# 3. Is it the readiness probe specifically?
kubectl get pod <new-pod> -o jsonpath='{.status.containerStatuses[*].ready}{"\n"}'
```

The four usual causes:

| Cause | Tell |
|:---|:---|
| Readiness probe failing (wrong path/port) | `describe` shows `Readiness probe failed` |
| No room on any node | New pod is `Pending`, Events show `FailedScheduling` |
| Image cannot be pulled | `ImagePullBackOff` |
| `PodDisruptionBudget` blocks draining the old pods | `kubectl get pdb` — old pods stay Running |

:::key Say this and you have answered well
"I would not just raise the timeout. `rollout status` hanging is the system
protecting me — it is refusing to finish a rollout that would leave the
service unable to serve. The correct move is `kubectl rollout undo` to
restore the previous version, and *then* debug the new one."
:::

:::ar
كلمة «شكلهم تمام» هي الفخ. الـ `rollout status` بيستنى **`Ready`**،
مش `Running`. وهو **بيستنى للأبد بقصد** بدل إنه يقول إن إصدار باظ سليم.

**امشي كده:**

```sh
kubectl get rs -l app=web        # مين الـ ReplicaSet الجديدة؟
kubectl describe pod <بود-جديد>  # الـ Events هتقولك السبب حرفياً
```

والأسباب الأربعة المعتادة:

| السبب | تعرفه إزاي |
|:---|:---|
| الـ readiness probe بتفشل (مسار أو بورت غلط) | `describe` بيكتب `Readiness probe failed` |
| مفيش مكان على أي نود | البود `Pending` و Events فيها `FailedScheduling` |
| الصورة مش بتنزّل | `ImagePullBackOff` |
| `PodDisruptionBudget` مانعة تصريف القدامى | `kubectl get pdb` والقدامى لسه Running |

**والجملة اللي لو قلتها تبقى جاوبت صح:**

> «أنا **مش** هرفع الـ timeout. الـ `rollout status` اللي بيتعلّق ده
> **السيستم بيحميني** — هو بيرفض يخلّص تحديث هيسيب الخدمة مش قادرة
> تشتغل. الحركة الصح هي `kubectl rollout undo` أرجّع الإصدار القديم
> **الأول**، وبعدين أقعد أظبّط الجديد على راحتي.»

اللي بيرفع الـ timeout بيسكّت المنبه. واللي بيعمل undo بيحمي الخدمة.
:::
:::

:::q You changed a ConfigMap. The pods still use the old value. Why, and what do you do?
Because **nothing restarts a pod when a ConfigMap changes.** The Deployment's
pod spec did not change, so there is no new ReplicaSet and no rollout.

What happens depends on how the ConfigMap is consumed:

| Mounted as | On ConfigMap change |
|:---|:---|
| Environment variables (`envFrom`) | **Never** updates — env is set once at process start |
| A volume | The file **does** update, after a sync delay (~60s) — but only if your app re-reads it |
| `subPath` volume mount | **Never** updates, even though it is a volume |

```sh
kubectl rollout restart deploy/web    # recreate the pods, no spec change needed
```

:::key The senior answer
Do not stop at the command. The durable fix is to make config changes
*visible* to the Deployment: put a hash of the ConfigMap into a pod
template annotation, so changing the config changes the pod spec and
triggers a normal, observable, rollback-able rollout. Helm does this with
`checksum/config`; Kustomize does it with `configMapGenerator` name
suffixes.

That turns an invisible mutation into a versioned deploy — which is the
whole point of declarative infrastructure.
:::

:::ar
عشان **مفيش أي حاجة بتعمل restart للبود لما ConfigMap تتغير.**

الـ pod spec بتاع الـ Deployment **ما اتغيرش**، فمفيش ReplicaSet جديدة،
ومفيش rollout. من وجهة نظر كوبرنيتيس، مفيش حاجة حصلت.

**واللي بيحصل بيعتمد على إنك ركّبتها إزاي:**

| مركّبة كـ | لما الـ ConfigMap تتغير |
|:---|:---|
| متغيرات بيئة (`envFrom`) | **عمرها ما تتحدّث** — البيئة بتتحدد مرة واحدة وقت بدء العملية |
| volume | الملف **بيتحدّث** بعد تأخير (دقيقة تقريباً) — بس بشرط تطبيقك يعيد قراءته |
| volume بـ `subPath` | **عمرها ما تتحدّث**، رغم إنها volume |

**الحل السريع:**

```sh
kubectl rollout restart deploy/web
```

**والحل بمستوى سينيور — متقفش عند الأمر:**

الحل الدايم إنك تخلي تغيير الإعدادات **ظاهر** للـ Deployment: حُط
**hash للـ ConfigMap** في annotation جوه الـ pod template.

كده أول ما الإعداد يتغير، الـ hash يتغير، فالـ pod spec يتغير، فيحصل
**rollout عادي** — تشوفه، وتتابعه، وتقدر ترجع منه.

و Helm بيعمل كده بـ `checksum/config`، و Kustomize بيعمله بـ
`configMapGenerator` اللي بيضيف لاحقة للاسم.

**والفكرة الكبيرة:** إنك حوّلت **تغيير مخفي** لـ **نشر موثّق ومُصدَّر**.
وده أساس فكرة الـ declarative infrastructure كلها.
:::
:::

## Key takeaways

- **Deployment → ReplicaSet → Pods.** One ReplicaSet per version, which is what
  makes rollback instant.
- **Readiness removes from traffic; liveness restarts.** Confusing them causes
  restart cascades.
- **Liveness must never check dependencies**, and slow starters need a
  `startupProbe`.
- **`rollout undo`** is one command. Old ReplicaSets exist for exactly this.
- **`rollout restart`** to pick up new config without changing the spec.
- Deploy-time 502s are the endpoint-propagation race — fix with a `preStop`
  sleep.

:::ar الخلاصة
1. **Deployment ← ReplicaSet ← Pods.** ReplicaSet لكل إصدار، وعشان كده
   الـ rollback لحظي.
2. **الـ readiness بتشيل من الترافيك، والـ liveness بتقتل وترجّع.**
   لخبطتهم بتعمل حلقة restart بتوقّع الموقع.
3. **الـ liveness ممنوع تشيك على dependencies** خالص. واللي بطيء في القيام
   ياخد `startupProbe`.
4. **`rollout undo` أمر واحد.** الـ ReplicaSets القديمة موجودة لده بالظبط.
5. **`rollout restart`** لما تعدّل ConfigMap وعايز البودات تشوف الجديد.
6. **الـ ٥٠٢ في كل ديبلوي** سببها سباق انتشار الـ endpoints — حلّها
   بـ `preStop` فيه `sleep`.
7. **`maxUnavailable: 0` و `maxSurge: 1`** هو الاختيار الآمن في البرودكشن:
   اعمل الجديد الأول وبعدين اقفل القديم.
:::
