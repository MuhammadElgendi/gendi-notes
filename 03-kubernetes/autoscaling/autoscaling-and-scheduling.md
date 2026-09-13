---
title: Autoscaling and Scheduling
slug: autoscaling-and-scheduling
type: guide
domain: 03-kubernetes
tags: [kubernetes, autoscaling, scheduling]
keywords: [hpa, vpa, cluster autoscaler, karpenter, keda, taint, toleration,
           affinity, anti-affinity, topology spread, pdb, priority, preemption,
           تحجيم, جدولة, توزيع, أولوية]
level: 3
status: stable
prerequisites: [kubernetes-deployments, kubernetes-architecture]
related: [kubernetes-architecture, kubernetes-deployments, prometheus,
          devops-interview-questions]
updated: 2026-09-13
---

# Autoscaling and Scheduling

> Autoscaling adds pods; the scheduler decides where they go; the cluster autoscaler adds machines when there is nowhere. Three separate systems, and most "autoscaling is broken" is really one of the other two.

## What is it?

Two questions that people merge and should not:

| Question | Answered by |
|:---|:---|
| **How many** pods should exist? | HPA, VPA, KEDA |
| **Where** does each pod go? | The scheduler — via taints, affinity, spread |
| **Are there enough machines?** | Cluster Autoscaler, or Karpenter |

```diagram
   load rises
      │
      ↓
   ① HPA           reads metrics, raises replicas      3 → 8
      │
      ↓
   ② Scheduler     tries to place 5 new pods
      │
      ├── room exists  ──→ placed, done
      │
      └── no room      ──→ pods Pending
                             │
                             ↓
   ③ Cluster Autoscaler   sees Pending pods, adds a node
                             │
                             ↓
                          scheduler places them
```

:::ar
فيه سؤالين الناس بتلخبطهم، **والمفروض يفضلوا منفصلين**:

| السؤال | مين بيجاوبه |
|:---|:---|
| **كام** بود يبقى موجود؟ | HPA، VPA، KEDA |
| البود ده يروح **فين**؟ | **الـ Scheduler** |
| فيه **ماكينات** كفاية؟ | Cluster Autoscaler أو Karpenter |

**وأهم حاجة تفهمها من الرسمة اللي فوق:**

**الـ HPA بيعمل بودات، مش سيرفرات.**

فلو الحمل زاد والـ HPA كبّر من ٣ لـ ٨، والكلاستر مفيهوش مكان — **الخمس
بودات الجداد بيقعدوا `Pending` وخلاص**.

**والـ HPA مش هيعمل حاجة تانية، وهو مش باظ.** هو خلّص شغله.

**واللي بيزوّد الماكينات حاجة تانية خالص** اسمها Cluster Autoscaler،
وهي بتراقب البودات الـ `Pending` وبتضيف نود.

**فلو شوفت `Pending` بعد ما الـ HPA اشتغل، متدوّرش في الـ HPA** —
المشكلة في الطبقة اللي تحتها.
:::

## Scaling pods

### HPA — horizontal, the one you will use

```yaml title="hpa.yaml"
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web }
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70      # 70% OF THE REQUEST, not of the node
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # wait 5 min before shrinking
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0     # scale up immediately
```

:::danger `averageUtilization: 70` is 70% of the **request**, not of the node
This is the single most misunderstood number in Kubernetes autoscaling.

If a container requests `100m` CPU and uses `70m`, it is at **70%** — even if
the node is almost idle. The HPA then scales up, because the *request* is what
the percentage is measured against.

Two consequences:

- **No request set → the HPA cannot work.** It reports `<unknown>` and does
  nothing, because there is no denominator.
- **Requests that are too low cause constant scaling.** The pods look
  permanently saturated relative to a tiny request, so you get far more
  replicas than the workload needs, each underused.

Right-size requests **before** tuning the HPA. An HPA on top of wrong requests
amplifies the error instead of correcting it.
:::

### The others, briefly

| Scaler | Changes | Use when |
|:---|:---|:---|
| **HPA** | Replica **count** | Web services, anything horizontally scalable |
| **VPA** | **Requests and limits** of a pod | Right-sizing; batch jobs |
| **KEDA** | Replica count, **from external events** | Queue depth, Kafka lag, cron |

:::warn Do not run HPA and VPA on the same CPU metric
They fight. The VPA raises the CPU request because usage is high; the higher
request lowers the measured utilisation percentage; the HPA then scales *down*;
the remaining pods get busier; the VPA raises requests again.

Safe combination: **VPA for memory, HPA for CPU**, or VPA in
`updateMode: "Off"` as a recommender only.
:::

:::ar تحجيم البودات
:::danger الـ ٧٠٪ دي **من الـ request**، مش من النود
**دي أكتر رقم بيتفهم غلط في تحجيم كوبرنيتيس.**

لو الكونتينر طالب `100m` وبيستخدم `70m`، هو عند **٧٠٪** — **حتى لو النود
كلها فاضية**.

والـ HPA بيكبّر، **عشان النسبة بتتقاس مقابل الـ request مش مقابل النود**.

**ونتيجتين:**

**١. مفيش `requests`؟ الـ HPA مش هيشتغل خالص.** بيكتب `<unknown>` ومش
بيعمل حاجة — **عشان مفيش مقام يقسّم عليه**.

**٢. `requests` صغيرة أوي = تكبير مستمر.** البودات بتبان **مخنوقة على
طول** مقابل طلب صغير، **فبتاخد نسخ أكتر بكتير من اللازم**، وكل واحدة
**مستخدمة شوية**.

**فظبّط الـ requests الأول، وبعدين اظبط الـ HPA.**

الـ HPA فوق requests غلط **بيضخّم الغلطة، مش بيصلّحها**.
:::

**وباقي الأنواع:**

| النوع | بيغيّر إيه | تستخدمه لما |
|:---|:---|:---|
| **HPA** | **عدد** النسخ | سيرفيسات ويب |
| **VPA** | **الـ requests والـ limits** | تظبيط الأحجام، شغل الدفعات |
| **KEDA** | عدد النسخ **من أحداث برّه** | طول الطابور، تأخير كافكا |

:::warn ومتشغّلش HPA و VPA على نفس مقياس المعالج
**هيتخانقوا:**

```diagram
   الاستخدام عالي
        ↓
   VPA بيرفع الـ request
        ↓
   النسبة المئوية بتقل (عشان المقام كبر)
        ↓
   HPA بيصغّر عدد النسخ!
        ↓
   البودات الباقية بتزحم أكتر
        ↓
   VPA بيرفع الـ request تاني... ولوب
```

**التركيبة الآمنة:** VPA للرام، و HPA للمعالج. أو VPA في وضع
`updateMode: "Off"` **كمستشار بس**.
:::
:::

## Controlling where pods land

### Taints and tolerations — the node repels

```sh
# The node repels everything that does not tolerate this
kubectl taint nodes gpu-1 workload=gpu:NoSchedule
```

```yaml
tolerations:
  - key: workload
    operator: Equal
    value: gpu
    effect: NoSchedule
```

| Effect | Meaning |
|:---|:---|
| `NoSchedule` | New pods without a toleration are not placed here |
| `PreferNoSchedule` | Soft — avoid if possible |
| `NoExecute` | Also **evicts** running pods that do not tolerate it |

:::key Tolerations permit; they do not attract
A toleration lets a pod be scheduled onto a tainted node. It does **not** make
the scheduler prefer it.

So a GPU pod with a toleration can still land on a normal node. To *require* the
expensive node you also need `nodeSelector` or `nodeAffinity`.

**Taint to keep others out; affinity to pull yourself in.** Both are needed for
dedicated node pools, and using only one is the usual mistake.
:::

### Affinity, anti-affinity, and spread

```yaml title="Spread replicas across zones, and keep them off each other"
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels: { app: web }

  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            topologyKey: kubernetes.io/hostname
            labelSelector:
              matchLabels: { app: web }
```

| Mechanism | Use for |
|:---|:---|
| `nodeSelector` | Simple: "must be on a node with this label" |
| `nodeAffinity` | Same, with `required` / `preferred` and expressions |
| `podAntiAffinity` | "Do not put my replicas together" |
| `topologySpreadConstraints` | **Even** distribution — the modern, better option |

:::warn `requiredDuringScheduling` can make pods unschedulable forever
`required` anti-affinity across hostnames means you can never have more
replicas than nodes. Scale to 10 on a 6-node cluster and 4 pods stay `Pending`
permanently — which looks like a capacity bug and is a policy you wrote.

Use `preferred` unless the constraint is genuinely a hard requirement, and
prefer `topologySpreadConstraints` with `whenUnsatisfiable: ScheduleAnyway` for
availability spreading.
:::

:::ar التحكّم في مكان البودات
**الـ Taints بتطرد، والـ Tolerations بتسمح.**

```sh
kubectl taint nodes gpu-1 workload=gpu:NoSchedule   # النود بتطرد أي حد مش متحمّل
```

| الـ Effect | معناه |
|:---|:---|
| `NoSchedule` | البودات الجديدة من غير toleration **مش بتتحط** هنا |
| `PreferNoSchedule` | تفضيل، مش إجبار |
| `NoExecute` | **وكمان بيطرد** البودات الشغالة اللي مش متحمّلة |

:::key والـ toleration **بتسمح، مش بتجذب**
**دي نقطة الناس بتقع فيها.**

الـ toleration بتخلي البود **مسموحله** ينزل على نود عليها taint.
**وهي مش بتخلي الـ scheduler يفضّلها.**

**فبود الـ GPU اللي معاه toleration لسه ممكن ينزل على نود عادية!**

**عشان تجبره على النود الغالية، محتاج كمان `nodeSelector` أو
`nodeAffinity`.**

**القاعدة: الـ taint بتمنع الغير، والـ affinity بتجذبك إنت. ولازم
الاتنين** — واستخدام واحد بس هو الغلطة المعتادة.
:::

:::danger و `requiredDuringScheduling` ممكن تخلي بودات `Pending` للأبد
الـ anti-affinity الإجبارية على الـ hostname معناها إنك **عمرك ما تعمل
نسخ أكتر من عدد النودات**.

كبّر لـ ١٠ على كلاستر فيه ٦ نودات، **و ٤ بودات هيقعدوا `Pending`
للأبد** — **وده شكله عطل سعة، وهو سياسة إنت كتبتها بإيدك**.

**استخدم `preferred`** إلا لو القيد **إجباري فعلاً**، **والأحسن
`topologySpreadConstraints`** مع `whenUnsatisfiable: ScheduleAnyway`
لو الغرض توزيع للأمان.
:::
:::

### PodDisruptionBudgets

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: web }
spec:
  minAvailable: 2          # or maxUnavailable: 1
  selector:
    matchLabels: { app: web }
```

A PDB constrains **voluntary** disruption — node drains, cluster autoscaler
scale-down, rolling node upgrades. It does **not** protect against a node
crashing, which is involuntary.

:::danger A PDB that can never be satisfied blocks every drain
`minAvailable: 3` with `replicas: 3` means no pod may ever be evicted
voluntarily. Then:

- `kubectl drain` hangs forever
- the cluster autoscaler cannot remove any node, so scale-down stops entirely
- automated node upgrades stall, silently, for weeks

The rule: **`minAvailable` must be less than `replicas`.** Use
`maxUnavailable: 1`, which stays correct when the replica count changes.
:::

## Adding machines

| Tool | How it works |
|:---|:---|
| **Cluster Autoscaler** | Watches `Pending` pods; grows a **node group**; removes underused nodes |
| **Karpenter** | Provisions **individual right-sized instances** directly, no node groups |

```diagram
   Pending pods exist
        │  and they would fit on a new node of this group
        ↓
   Cluster Autoscaler raises the ASG desired count
        ↓
   node boots, joins, scheduler places the pods    ← 1-4 minutes, typically
```

:::warn Scale-up takes minutes, so autoscaling is not a traffic-spike defence
The chain is: metrics scrape (up to 60s) → HPA evaluation (15s) → pods Pending →
autoscaler notices (10s) → instance boots and joins (1–4 min) → image pull.

That is comfortably **two to five minutes** before new capacity serves traffic.
For a spike that arrives in seconds, the answer is headroom, over-provisioning
with low-priority placeholder pods, or a queue — not autoscaling.
:::

:::ar الـ PDB وإضافة الماكينات
**الـ PodDisruptionBudget بتقيّد التعطيل الاختياري** — تفريغ نود،
تصغير الكلاستر، ترقية النودات. **وهي مش بتحميك من نود بتقع** (ده
تعطيل غير اختياري).

:::danger و PDB مستحيلة التحقيق **بتقفل كل تفريغ**
`minAvailable: 3` مع `replicas: 3` معناها **مفيش بود مسموح يتشال
اختيارياً أبداً**. والنتيجة:

- `kubectl drain` **بيقعد معلّق للأبد**
- الـ cluster autoscaler **مش قادر يشيل أي نود**، فالتصغير **بيقف خالص**
- وترقيات النودات الآلية **بتتعلّق في سكوت لأسابيع**

**القاعدة: `minAvailable` لازم تكون أقل من `replicas`.**

**والأحسن `maxUnavailable: 1`** — دي بتفضل صح **حتى لو عدد النسخ اتغير**.
:::

:::danger والتكبير بياخد دقايق — **فالتحجيم التلقائي مش دفاع ضد موجة ترافيك**
السلسلة كاملة:

```diagram
   قياس المقاييس (لحد ٦٠ ثانية)
        ↓
   تقييم الـ HPA (١٥ ثانية)
        ↓
   بودات Pending
        ↓
   الـ autoscaler بيلاحظ (١٠ ثواني)
        ↓
   الماكينة بتقوم وبتنضم (١ لـ ٤ دقايق)
        ↓
   تنزيل الصورة
        ↓
   ══ من دقيقتين لخمسة قبل ما القدرة الجديدة تخدم ══
```

**فلو الموجة بتيجي في ثواني، التحجيم التلقائي مش هيلحقك.**

**والحلول الحقيقية:** هامش زيادة دايم، أو بودات وهمية بأولوية واطية
بتحجز مكان (over-provisioning)، **أو طابور** يمتص الموجة.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| HPA shows `<unknown>` | No `resources.requests`, or no metrics-server | Set requests; install metrics-server |
| HPA scales constantly | Requests too low, or no stabilisation window | Right-size; add `behavior` |
| Pods `Pending` after scale-up | No node capacity | Cluster Autoscaler / Karpenter |
| Autoscaler never adds nodes | Node group at `maxSize`, or the pod cannot fit any node type | Check its logs and group limits |
| Autoscaler never removes nodes | A PDB, a DaemonSet, or local storage blocks eviction | `kubectl drain --dry-run` to see |
| GPU pod on a normal node | Toleration without affinity | Add `nodeSelector` |
| `drain` hangs forever | Unsatisfiable PDB | `maxUnavailable: 1` |
| Replicas all on one node | No anti-affinity or spread | `topologySpreadConstraints` |

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| الـ HPA بيكتب `<unknown>` | **مفيش `requests`**، أو مفيش metrics-server | حط requests ونصّب metrics-server |
| الـ HPA بيكبّر ويصغّر على طول | requests صغيرة، أو مفيش نافذة تهدئة | ظبّط الأحجام وحط `behavior` |
| بودات `Pending` بعد التكبير | **مفيش سعة في الكلاستر** | Cluster Autoscaler |
| الـ autoscaler عمره ما بيضيف نودات | وصل `maxSize`، أو البود مش داخل في أي نوع | شوف لوجزه وحدود المجموعة |
| الـ autoscaler عمره ما بيشيل نودات | **PDB** أو DaemonSet أو تخزين محلي | `kubectl drain --dry-run` |
| بود GPU على نود عادية | toleration **من غير** affinity | ضيف `nodeSelector` |
| الـ `drain` معلّق للأبد | PDB مستحيلة | `maxUnavailable: 1` |
| كل النسخ على نود واحدة | مفيش anti-affinity ولا spread | `topologySpreadConstraints` |
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Your HPA says `<unknown>` for CPU. Why?
Two causes, and they are easy to tell apart.

**1. No `resources.requests.cpu` on the container.** HPA utilisation is a
percentage **of the request**, so with no request there is no denominator and
the calculation is undefined.

**2. No metrics pipeline.** `metrics-server` is not installed, or it cannot
scrape the kubelets.

```sh
kubectl describe hpa web                  # the Events name which one
kubectl top pods                          # fails entirely → metrics-server
kubectl get deploy metrics-server -n kube-system
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].resources}{"\n"}'
```

:::key The follow-up that matters
"So what value should the request be?" — measure actual usage over a
representative period and set the request near the steady state, not near the
peak. Requests that are too high waste cluster capacity and cause `Pending`
pods on a cluster that looks half empty; too low causes throttling and HPA
thrash. The HPA is only as good as the request it divides by.
:::

:::ar
سببين، وسهل تفرّق بينهم.

**١. مفيش `resources.requests.cpu` على الكونتينر.**

نسبة الـ HPA **مقابل الـ request**، فمن غير request **مفيش مقام**
والحسبة مالهاش معنى.

**٢. مفيش خط مقاييس أصلاً.** الـ `metrics-server` مش منصّب، أو مش قادر
يقرا من الـ kubelets.

```sh
kubectl describe hpa web      # الـ Events بتقولك مين فيهم
kubectl top pods              # فاشل خالص؟ يبقى metrics-server
```

**والسؤال اللي بيجي بعده:** «طيب الـ request تبقى كام؟»

**قيس الاستخدام الحقيقي** على فترة ممثّلة، **وحط الـ request قريبة من
الوضع المستقر، مش من الذروة**.

الـ requests العالية بتضيّع سعة الكلاستر **وبتعمل بودات `Pending` على
كلاستر شكله نصه فاضي**. والواطية بتعمل خنق وتذبذب في الـ HPA.

**والـ HPA مش أحسن من الرقم اللي بيقسّم عليه.**
:::
:::

:::q Explain taints, tolerations and affinity, and how they combine for a dedicated node pool.
They solve **opposite halves** of the same problem:

| Mechanism | Direction | Effect |
|:---|:---|:---|
| **Taint** (on the node) | Repels | Nothing schedules here unless it tolerates |
| **Toleration** (on the pod) | **Permits** | This pod *may* go there — it is not attracted |
| **nodeAffinity / nodeSelector** (on the pod) | **Attracts** | This pod *must* or *prefers to* go there |

**A dedicated GPU pool needs both:**

```sh
kubectl taint nodes gpu-1 workload=gpu:NoSchedule   # keep everyone else off
kubectl label nodes gpu-1 workload=gpu              # give it an identity
```

```yaml
tolerations:                       # I am ALLOWED on the tainted node
  - { key: workload, operator: Equal, value: gpu, effect: NoSchedule }
nodeSelector:                      # and I REQUIRE that node
  workload: gpu
```

**With only the taint**, other workloads stay off — but your GPU pod may land
on a cheap CPU node instead.

**With only the affinity**, your GPU pod goes to the right place — but nothing
stops a batch job filling the expensive nodes.

:::ar
الاتنين بيحلّوا **نصّين متعاكسين** من نفس المشكلة:

| الآلية | مكانها | بتعمل إيه |
|:---|:---|:---|
| **Taint** | **على النود** | **بتطرد** — محدش بينزل هنا إلا لو متحمّل |
| **Toleration** | على البود | **بتسمح** — البود **ممكن** ينزل، **مش بيتجذب** |
| **nodeAffinity** | على البود | **بتجذب** — البود **لازم** أو **بيفضّل** ينزل هنا |

**ومجموعة نودات مخصصة محتاجة الاتنين:**

- **بالـ taint بس:** الشغل التاني **بيفضل بره** — **بس بود الـ GPU
  بتاعك ممكن ينزل على نود رخيصة**.
- **بالـ affinity بس:** بودك **بينزل المكان الصح** — **بس مفيش حاجة
  بتمنع شغل تاني إنه يملا النودات الغالية**.

**فلازم الاتنين مع بعض**، وده بالظبط الفرق بين حد فاهم وحد حافظ.
:::
:::

:::q Traffic spikes 5× in 30 seconds. Will autoscaling save you?
**No**, and understanding why is the point of the question.

```diagram
   metrics scrape        up to 60s   ← the spike is not even visible yet
   HPA evaluation             15s
   pods created, Pending       —
   autoscaler notices         10s
   instance boots and joins  1-4 min
   image pull + startup     10-60s
   ───────────────────────────────
   ≈ 2-5 minutes before new capacity serves
```

Your spike has come and gone — or taken the service down — long before that.

**What actually works:**

| Approach | Trade-off |
|:---|:---|
| **Headroom** — run at 40–50% utilisation | Costs money, works instantly |
| **Over-provisioning pods** — low-priority placeholders that get preempted | Nodes pre-warmed; small constant cost |
| **A queue** in front | Absorbs the spike; adds latency, needs the work to be async |
| **Rate limiting / load shedding** | Protects the service by rejecting some load deliberately |
| **Karpenter over Cluster Autoscaler** | Faster provisioning, still not seconds |

**Autoscaling is for the daily curve**, not for step changes. Naming that
distinction — gradual versus instantaneous — is the answer.

:::ar
**لأ** — **وفهم السبب هو الغرض من السؤال**.

بص على السلسلة في الرسمة: **من دقيقتين لخمسة** قبل ما القدرة الجديدة
تخدم. **وموجتك راحت وجت** — أو وقّعت الخدمة — **قبل كده بكتير**.

**واللي بينفع فعلاً:**

| الطريقة | التنازل |
|:---|:---|
| **هامش دايم** — اشتغل على ٤٠–٥٠٪ | **بيكلّف فلوس، وبيشتغل فوراً** |
| **بودات وهمية بأولوية واطية** بتحجز مكان وبتتشال أول ما تحتاج | النودات **مسخّنة**، وتكلفة بسيطة |
| **طابور قدامه** | بيمتص الموجة، بس بيزوّد تأخير |
| **تحديد معدّل / رمي حمل** | بتحمي الخدمة **برفض جزء من الحمل بقصد** |

**والتحجيم التلقائي للمنحنى اليومي، مش للقفزات المفاجئة.**

**وإنك تسمّي الفرق ده — تدريجي مقابل لحظي — هو الإجابة.**
:::
:::

## Key takeaways

- **HPA adds pods; the Cluster Autoscaler adds machines.** `Pending` after a
  scale-up means the second one, not a broken HPA.
- **HPA percentages are of the `request`.** No request means no HPA, and a
  wrong request amplifies into wrong replica counts.
- **Do not run HPA and VPA on the same metric** — they oscillate.
- **Tolerations permit, affinity attracts.** A dedicated pool needs both.
- **`required` anti-affinity caps replicas at your node count**, permanently.
- **An unsatisfiable PDB blocks every drain**, which silently stops node
  upgrades and scale-down. Use `maxUnavailable: 1`.
- **Autoscaling takes minutes.** For instant spikes, buy headroom.

:::ar الخلاصة
1. **الـ HPA بيزوّد بودات، والـ Cluster Autoscaler بيزوّد ماكينات.**
   `Pending` بعد التكبير معناها **التاني**، مش إن الـ HPA باظ.
2. **نِسَب الـ HPA مقابل الـ `request`.** مفيش request = مفيش HPA،
   **و request غلط بيتضخّم لعدد نسخ غلط**.
3. **متشغّلش HPA و VPA على نفس المقياس** — **هيتأرجحوا**.
4. **الـ tolerations بتسمح، والـ affinity بتجذب.** والمجموعة المخصصة
   **محتاجة الاتنين**.
5. **الـ anti-affinity الإجبارية بتحدد نسخك بعدد نوداتك**، للأبد.
6. **الـ PDB المستحيلة بتقفل كل تفريغ** — وبتوقّف ترقيات النودات
   **في سكوت**. استخدم `maxUnavailable: 1`.
7. **التحجيم بياخد دقايق.** للقفزات اللحظية، **اشتري هامش**.
:::
