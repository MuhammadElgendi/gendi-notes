---
title: Kubernetes Architecture
slug: kubernetes-architecture
type: architecture
domain: 03-kubernetes
tags: [kubernetes, architecture, control-plane]
keywords: [api server, etcd, scheduler, controller manager, kubelet, kube-proxy,
           cri, cni, csi, containerd, watch, informer, admission, webhook,
           reconciliation, control loop, binding, leader election,
           معمارية, مكونات, كوبرنيتيس, ازاي بيشتغل]
level: 3
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-pods, kubernetes-deployments, kubernetes-services,
          kubernetes-troubleshooting, devops-interview-questions]
updated: 2026-09-13
---

# Kubernetes Architecture

> Nothing in Kubernetes calls anything. Every component watches the API server for a gap between what you asked for and what exists, then acts to close it — and that single sentence explains the whole system.

## What is it?

A cluster is two halves: a **control plane** that decides, and **worker nodes**
that run containers. They never talk to each other directly. Everything goes
through one door — the **API server** — and everything else is a loop watching
that door.

```diagram
┌──────────────────── CONTROL PLANE ─────────────────────────────────┐
│                                                                    │
│   ┌────────┐      ┌──────────────┐      ┌───────────┐              │
│   │  etcd  │ ←──→ │  API SERVER  │ ←──→ │ Scheduler │              │
│   └────────┘      └──────────────┘      └───────────┘              │
│    the only        the ONLY door         picks a node              │
│    database        authn · authz                                   │
│                    admission · validate  ┌──────────────────┐      │
│                          ↑          ←──→ │ Controller mgr   │      │
│                          │               └──────────────────┘      │
│                          │                keeps desired = actual   │
└──────────────────────────┼─────────────────────────────────────────┘
                           │  every arrow above and below is
                           │  a WATCH on the API server
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   NODE 1     │   │   NODE 2     │   │   NODE 3     │
│  kubelet     │   │  kubelet     │   │  kubelet     │
│  kube-proxy  │   │  kube-proxy  │   │  kube-proxy  │
│  containerd  │   │  containerd  │   │  containerd  │
│  [ pods… ]   │   │  [ pods… ]   │   │  [ pods… ]   │
└──────────────┘   └──────────────┘   └──────────────┘
```

:::ar
الكلاستر نصين: **control plane** بيقرر، و **worker nodes** بتشغّل الكونتينرات.

**وأهم حاجة تفهمها من الرسمة دي:** النصين **مش بيكلّموا بعض مباشرة**. كل
حاجة بتمر على باب واحد بس اسمه **API server**، وكل المكوّنات التانية مجرد
حلقات قاعدة **تراقب** الباب ده.

خد بالك من الكلمة دي: **تراقب** (watch). مش «تستقبل أوامر».

يعني مفيش حاجة في كوبرنيتيس بتقول لحاجة تانية «اعمل كذا». كل واحدة قاعدة
بتبص على الـ API server وبتقول لنفسها: «فيه حاجة مطلوبة مني؟ لو أيوه،
هعملها».

**وده اللي بيخلي السيستم يصلّح نفسه** — وكمان ده اللي بيخلي الأعطال فيه
شكلها غريب: لما كنترولر يبوظ، **إنت مش بتشوف إيرور، إنت بتشوف إن مفيش حاجة
بتحصل خالص**.
:::

## Why it is built this way

The alternative — components calling each other — was tried by earlier
orchestrators and it does not survive partial failure.

| If components called each other | With a shared watched store |
|:---|:---|
| A sends to B; B is down → the instruction is lost | The desired state is written down; B acts when it returns |
| Every component needs every other's address | Everything needs one address |
| N components → N² connections to secure | N connections, one auth model |
| State lives in messages, which vanish | State lives in etcd, which persists |
| Recovery means replaying messages | Recovery means re-reading current state |

:::key The defining property: level-triggered, not edge-triggered
An **edge-triggered** system reacts to *events* — "a pod was deleted". Miss the
event and you are permanently wrong.

Kubernetes is **level-triggered**: components react to *state* — "there are 2
pods and I want 3". Miss an update, crash, restart, and you re-read the current
state and still reach the right answer.

That is why you can kill any controller, restart it, and nothing is lost.
:::

:::ar ليه اتبنى بالشكل ده؟
البديل — إن كل مكوّن ينادي على التاني مباشرة — اتجرّب في أدوات أقدم، **وفشل
مع الأعطال الجزئية**.

| لو المكوّنات بتنادي بعض | مع مخزن مشترك بيتراقب |
|:---|:---|
| A بيبعت لـ B، و B واقع ← **الأمر ضاع** | المطلوب **متكتوب**، و B ينفّذه لما يرجع |
| كل مكوّن محتاج عنوان كل المكوّنات | الكل محتاج عنوان واحد |
| N مكوّن ← N² اتصال تأمّنهم | N اتصال، ونظام صلاحيات واحد |
| الحالة عايشة في الرسايل، والرسايل بتضيع | الحالة عايشة في etcd، وبتفضل |

:::key الخاصية اللي بتفرّق: level-triggered مش edge-triggered
دي أهم فكرة هندسية في كوبرنيتيس، وبتتسأل في الانترفيوهات المتقدمة.

**النظام الـ edge-triggered** بيتفاعل مع **الأحداث**: «بود اتمسح». وطالما
فاتك الحدث، إنت **غلط للأبد**.

**وكوبرنيتيس level-triggered**: بيتفاعل مع **الحالة**: «فيه ٢ وأنا عايز ٣».

فلو فاتك تحديث، أو المكوّن وقع وقام تاني، إنت **بتقرأ الحالة الحالية من
الأول** وبتوصل لنفس النتيجة الصح.

**وعشان كده تقدر تقتل أي كنترولر وترجّعه ومفيش حاجة بتضيع.** جرّبها.
:::
:::

## What it is made of

### Control plane

| Component | Job | If it stops |
|:---|:---|:---|
| **kube-apiserver** | The only way in. Authn, authz, admission, validation, then writes to etcd | No changes possible. Running pods keep running |
| **etcd** | The only database. Every object, and the watch stream | The cluster loses its memory. **Back this up** |
| **kube-scheduler** | Assigns a node to pods that have none | New pods stay `Pending`. Existing ones untouched |
| **kube-controller-manager** | ~30 controllers in one binary, reconciling objects | Deploys stall **silently** — no error, just nothing |
| **cloud-controller-manager** | Cloud-specific: load balancers, node lifecycle, routes | `LoadBalancer` Services stay `<pending>` |

### Worker node

| Component | Job | If it stops |
|:---|:---|:---|
| **kubelet** | Watches for pods bound to *its* node, then makes them real | Node goes `NotReady`; pods evicted after a timeout |
| **kube-proxy** | Programs the node's forwarding rules from EndpointSlices | Existing connections survive; new Service routing breaks |
| **Container runtime** | Actually starts containers (containerd, CRI-O) | Nothing runs on that node |

### The three plug-in interfaces

Kubernetes deliberately implements none of these itself:

```diagram
   kubelet
      │
      ├── CRI ──→ containerd / CRI-O          "run this container"
      │
      ├── CNI ──→ Calico / Cilium / flannel   "give this pod an IP"
      │
      └── CSI ──→ EBS / Ceph / NFS driver     "attach this volume"
```

:::ar المكوّنات، وكل واحد شغلته إيه
**الـ Control Plane — الإدارة:**

| المكوّن | شغلته | لو وقع |
|:---|:---|:---|
| **kube-apiserver** | الباب الوحيد. هوية، صلاحيات، admission، تحقّق، وبعدين يكتب في etcd | مفيش تغيير. **واللي شغّال يفضل شغّال** |
| **etcd** | الداتابيز الوحيدة. كل الأوبجكتس، وستريم الـ watch | الكلاستر **بينسى نفسه**. خُد باك أب! |
| **kube-scheduler** | بيختار نود للبودات اللي مالهاش نود | البودات الجديدة `Pending` |
| **controller-manager** | حوالي ٣٠ كنترولر في برنامج واحد | الديبلويات بتتعلّق **في سكوت** |
| **cloud-controller-manager** | حاجات الكلاود: LB، النودات، الراوتس | الـ `LoadBalancer` يفضل `<pending>` |

**الـ Worker Node — الموظفين:**

| المكوّن | شغلته |
|:---|:---|
| **kubelet** | بيراقب البودات المربوطة **بالنود بتاعته هو**، وبيحوّلها لحقيقة |
| **kube-proxy** | بيكتب قواعد التوجيه على النود من الـ EndpointSlices |
| **runtime** | بيشغّل الكونتينرات فعلاً (containerd) |

**والتلات واجهات اللي كوبرنيتيس بقصد مش بينفّذها بنفسه:**

| الواجهة | معناها | مين بينفّذها |
|:---|:---|:---|
| **CRI** | «شغّل الكونتينر ده» | containerd، CRI-O |
| **CNI** | «إدي البود ده IP» | Calico، Cilium، flannel |
| **CSI** | «ركّب الـ volume ده» | EBS، Ceph، NFS |

**وليه بقصد؟** عشان كوبرنيتيس عايز يشتغل على أي كلاود وأي ستوريدج وأي
شبكة. فبدل ما يدعم كله، هو **بيحدد الواجهة** وأي حد يكتب الـ driver بتاعه.

وده بيفسّرلك حاجة عملية: لما البودات تقعد في `ContainerCreating` وإنت مش
فاهم ليه — **دوّر في الـ CNI أو الـ CSI**، مش في كوبرنيتيس نفسه. غالباً
الشبكة مش قادرة تدي IP، أو الـ volume مش راضي يتركّب.
:::

## How it works: `kubectl create deploy` end to end

This is the question. Follow one command all the way down.

```sh
kubectl create deployment web --image=nginx:1.27 --replicas=3
```

### Step 1 — kubectl builds an HTTP request

`kubectl` is a plain HTTP client. It reads `~/.kube/config` for the API server
address and your credentials, turns the flags into a Deployment object, and
POSTs it.

```sh
# Prove it — this prints the request and response without the abstraction
kubectl create deployment web --image=nginx:1.27 --replicas=3 -v=8
```

```text
POST https://10.0.0.1:6443/apis/apps/v1/namespaces/default/deployments
Authorization: Bearer <token>
Content-Type: application/json
{"kind":"Deployment","spec":{"replicas":3,...}}
```

:::key
There is nothing special about `kubectl`. Anything that can make an authenticated
HTTPS request can drive Kubernetes — which is why `curl`, client libraries,
Terraform providers and CI systems all work identically.
:::

### Step 2 — the API server runs four gates, in order

This order matters and is asked about constantly.

```diagram
   request
      │
      ↓
   ① AUTHENTICATION     who are you?
      │                 certs · bearer tokens · OIDC · webhook
      │                 fails → 401
      ↓
   ② AUTHORIZATION      may you do this?
      │                 RBAC: can <user> <verb> <resource> in <namespace>?
      │                 fails → 403
      ↓
   ③ ADMISSION          should this be changed, or refused?
      │                 MUTATING first  — defaults, sidecar injection
      │                 then VALIDATING — policy, quotas
      │                 fails → 400 with the webhook's message
      ↓
   ④ VALIDATION         is the object well-formed?
      │                 schema, required fields, immutable fields
      │                 fails → 400
      ↓
   WRITE TO etcd        ← and only now does the object exist
      │
      ↓
   201 Created   →  kubectl prints "deployment.apps/web created"
```

:::warn What "created" actually means
At this point **nothing is running**. No container has been pulled, no node has
been chosen. A row exists in etcd saying you *want* three replicas.

`kubectl create` returning success means "your request was recorded", never
"your application is up". This is why CI pipelines that stop at `kubectl apply`
report green over a broken deploy — you need `kubectl rollout status`.
:::

:::ar الـ API server بيعدّي الطلب على ٤ بوابات، بالترتيب
الترتيب ده مهم جداً وبيتسأل عليه كتير:

| # | البوابة | بتسأل إيه | لو فشلت |
|:---|:---|:---|:---|
| ١ | **Authentication** | **إنت مين؟** | 401 |
| ٢ | **Authorization** | **من حقك تعمل كده؟** (RBAC) | 403 |
| ٣ | **Admission** | **نعدّل الطلب ولا نرفضه؟** | 400 |
| ٤ | **Validation** | **الأوبجكت مكتوب صح؟** | 400 |

**والـ Admission نوعين، والترتيب بينهم مهم:**

- **Mutating** بييجي **الأول** — ده اللي **بيعدّل** الطلب. زي إنه يحط
  قيم افتراضية، أو **يحقن sidecar** (وده بالظبط إزاي Istio بيحط الـ
  proxy في بودك من غير ما تكتبه).
- **Validating** بييجي بعده — ده **بيوافق أو يرفض بس**، مش بيعدّل. زي
  سياسات الأمان والـ quotas.

**منطقي:** لازم تخلّص كل التعديلات **الأول**، وبعدين تتحقق من الشكل
النهائي. لو عكست، هتوافق على حاجة وبعدين تتعدّل من ورا ظهرك.

:::danger و «created» **مش** معناها إن حاجة اشتغلت
دي أهم نقطة عملية في القسم ده.

لما `kubectl create` يرجّعلك `deployment.apps/web created`، **مفيش أي حاجة
شغالة لحد دلوقتي**. مفيش صورة اتنزّلت، ومفيش نود اتختارت.

اللي حصل إن **صف اتكتب في etcd** مكتوب فيه إنك **عايز** ٣ نسخ. وخلاص.

**وعشان كده الـ pipelines اللي بتقف عند `kubectl apply` بتقول «نجح»
والبرودكشن واقع.** إنت محتاج:

```sh
kubectl rollout status deploy/web --timeout=5m
```
:::
:::

### Step 3 — controllers notice, in a chain

Nobody told the controllers anything. They hold an open **watch** on the API
server and receive the new object on that stream.

```diagram
   etcd now has: Deployment web (replicas: 3)
        │
        │  watch event
        ↓
   ┌────────────────────┐
   │ Deployment         │  "a Deployment with no ReplicaSet →
   │ controller         │   create one, with a pod-template hash"
   └────────────────────┘
        │  creates
        ↓
   ReplicaSet web-7d4f9c   (replicas: 3, owns pods by label)
        │
        │  watch event
        ↓
   ┌────────────────────┐
   │ ReplicaSet         │  "I want 3, I can see 0 →
   │ controller         │   create 3 Pod objects"
   └────────────────────┘
        │  creates
        ↓
   Pod web-7d4f9c-a1b2   spec.nodeName: ""   ← still just rows in etcd
   Pod web-7d4f9c-c3d4   spec.nodeName: ""
   Pod web-7d4f9c-e5f6   spec.nodeName: ""
```

Watch the chain yourself:

```sh
kubectl get deploy,rs,pods -l app=web
kubectl get events --sort-by=.lastTimestamp | tail -20
```

### Step 4 — the scheduler binds each pod to a node

The scheduler watches for pods where `spec.nodeName` is empty. For each one it
runs two phases:

```diagram
   ALL NODES  (say 20)
        │
        │  ① FILTER — hard constraints. A node either passes or it does not.
        │     · enough allocatable CPU/memory for the REQUESTS?
        │     · tolerates the node's taints?
        │     · nodeSelector / affinity satisfied?
        │     · required ports free? volume attachable in this zone?
        ↓
   FEASIBLE NODES  (say 6)      ← none left? pod stays Pending, Events say why
        │
        │  ② SCORE — soft preferences, 0-100 each, weighted and summed
        │     · least requested / most requested
        │     · spread across zones and existing replicas
        │     · image already present on the node
        │     · inter-pod affinity satisfied
        ↓
   BEST NODE  →  BIND: write spec.nodeName = "node-2"  back to the API server
```

The scheduler's only output is a write. It never contacts the node.

```sh
# Why did this pod land where it did — or not land at all?
kubectl describe pod <pod> | tail -20        # Events name the failing predicate
kubectl get pod <pod> -o jsonpath='{.spec.nodeName}{"\n"}'
```

:::ar الـ Scheduler بيختار إزاي؟ مرحلتين
هو بيراقب البودات اللي `spec.nodeName` بتاعها **فاضي**، وبيعمل مرحلتين:

**١. الفلترة (Filter) — شروط قاسية.** النود إما بتعدّي إما لأ:

- فيها موارد كفاية لـ **الـ requests**؟ (مش الاستخدام الفعلي!)
- بتتحمّل الـ taints اللي عليها؟
- الـ nodeSelector والـ affinity متحققين؟
- الـ volume ينفع يتركّب في المنطقة دي؟

**٢. التنقيط (Score) — تفضيلات.** كل نود بتاخد نقط من ١٠٠:

- الأفضى بياخد أعلى (افتراضياً)
- التوزيع على مناطق مختلفة وعلى نسخ موجودة
- **الصورة موجودة على النود خلاص؟** ياخد نقط زيادة (عشان هيقوم أسرع)

**وبعدين بيربط (Bind):** بيكتب `spec.nodeName = "node-2"` ويبعتها للـ
API server. **وخلاص، شغله انتهى.**

:::key الـ Scheduler **عمره ما بيكلّم النود**
دي حاجة بتفاجئ الناس. الـ scheduler **مخرجاته الوحيدة كتابة في etcd**.

هو بيكتب اسم النود على البود، **وبس**. مفيش أي اتصال بالنود نفسها.

والنود هي اللي بعد كده **بتلاقي** إن فيه بود مربوط بيها. وهنرجع لده في
الخطوة اللي جاية.
:::
:::

### Step 5 — the kubelet makes it real

Each kubelet watches for pods where `spec.nodeName` equals **its own** node
name. When one appears, it does the actual work:

```diagram
   kubelet on node-2 sees a pod bound to itself
        │
        ├─→ CNI plugin        set up the network namespace, allocate a pod IP
        │
        ├─→ CRI: pull image   containerd → registry (honours imagePullPolicy
        │                     and imagePullSecrets)
        │
        ├─→ CSI plugin        attach and mount any volumes
        │
        ├─→ CRI: run          start the pause container, then init containers
        │                     to completion, then app containers
        │
        ├─→ probes            startup → readiness → liveness, on their schedules
        │
        └─→ PATCH status      report back to the API server:
                              phase: Running, podIP, containerStatuses, Ready
```

That status write is what makes the pod appear as `Running` in `kubectl get
pods`. The status you read is always **the kubelet's report**, not a live query.

### Step 6 — the pod becomes reachable

Two more controllers react to the pod turning Ready:

```diagram
   Pod becomes Ready
        │
        ├─→ EndpointSlice controller
        │      adds the pod IP to the Service's EndpointSlice
        │           │
        │           │  watch event
        │           ↓
        │      kube-proxy ON EVERY NODE
        │      rewrites iptables / IPVS / eBPF rules so the
        │      ClusterIP now DNATs to this pod too
        │
        └─→ CoreDNS already resolves the Service name; it did not change
```

Only now does traffic reach your container — and the gap between "pod Ready"
and "every node has reprogrammed" is exactly the race that causes deploy-time
502s.

:::ar الخطوات ٥ و ٦ — من «صف في الداتابيز» لـ «كونتينر شغّال بيستقبل ترافيك»
**الخطوة ٥ — الـ kubelet:**

كل kubelet قاعد بيراقب البودات اللي `spec.nodeName` بتاعها **= اسم النود
بتاعته هو**. أول ما يلاقي واحد، بيبدأ الشغل الحقيقي:

1. **CNI** — يظبّط الشبكة ويدي البود **IP**
2. **CRI** — ينزّل الصورة من الـ registry
3. **CSI** — يركّب الـ volumes
4. **CRI** — يشغّل الـ pause، وبعدين الـ init containers لحد ما يخلصوا،
   وبعدين كونتينرات التطبيق
5. **الـ probes** تبدأ تشتغل
6. **يبعت الحالة** للـ API server: `Running`، الـ IP، والـ `Ready`

:::key الحالة اللي بتشوفها **تقرير**، مش استعلام حي
لما تكتب `kubectl get pods` وتشوف `Running` — إنت **مش** بتسأل النود.

إنت بتقرأ **آخر تقرير** الـ kubelet كتبه في etcd.

**وده بيفسّر حاجة مهمة:** لو النود اتقطعت عن الشبكة، البودات بتفضل مكتوبة
`Running` لمدة (الافتراضي ٤٠ ثانية قبل ما تتعلّم `NotReady`) — **مش** عشان
هي شغالة، لكن عشان **مفيش حد بيبلّغ بالعكس**.
:::

**الخطوة ٦ — البود يبقى موصول:**

أول ما البود يبقى `Ready`:

1. **EndpointSlice controller** بيضيف الـ IP بتاعه للـ Service
2. **kube-proxy على كل نود** بيقرا التغيير ويعيد كتابة قواعد التوجيه

**ودلوقتي بس** الترافيك بيوصل لكونتينرك.

**والفتحة بين «البود بقى Ready» و «كل النودات كتبت القواعد» هي بالظبط
السباق اللي بيعمل ٥٠٢ وقت الديبلوي** — وحلها `preStop` فيه `sleep`.
:::

### The whole path, in one picture

```diagram
   you ──→ kubectl ──→ API server ──→ etcd
                            ↑            │
                            │            │ watch
                            │            ↓
                            │      Deployment ctrl ──→ ReplicaSet ctrl ──→ Pods
                            │            │
                            │            ↓
                            │        Scheduler        picks a node, writes nodeName
                            │            │
                            │            ↓
                            └───── kubelet on that node
                                         │
                                         ├─ CNI: IP
                                         ├─ CRI: pull + run
                                         ├─ CSI: volumes
                                         └─ report status back up

   EVERY arrow into the API server is a write.
   EVERY arrow out of it is a watch.
   No component ever calls another component.
```

## How components actually communicate

### Watch, not poll

A naive controller would poll: "list all pods, every second". With 5,000 pods
that is unusable. Instead:

```diagram
   controller startup
        │
        ├─ ① LIST    one full read — "give me all Deployments now"
        │            builds an in-memory cache, with a resourceVersion
        │
        └─ ② WATCH   a long-lived HTTP stream from that resourceVersion
                     the API server pushes only CHANGES down it
                        │
                        ↓
                  ADDED / MODIFIED / DELETED events
                        │
                        ↓
                  update the local cache, enqueue the object key
                        │
                        ↓
                  worker pops the key, reads the CURRENT state
                  from cache, and reconciles
```

This pattern is called an **informer**, and it is why `client-go` controllers
scale. Two details worth knowing:

- The queue holds **keys, not events**. Five rapid changes to one Deployment
  collapse into one key, reconciled once against final state. This is
  level-triggered behaviour falling out of the design.
- If the watch breaks or falls too far behind, the client gets
  `410 Gone — resourceVersion too old` and does a **full re-LIST**. Correctness
  is preserved through any disconnection.

### Leader election

`kube-controller-manager` and `kube-scheduler` run multiple replicas for
availability, but **only one may act** — two schedulers binding the same pod to
different nodes would be a disaster.

```sh
# The lease shows who currently holds it
kubectl get lease -n kube-system kube-scheduler -o yaml
```

They contend for a `Lease` object in `kube-system`. The holder renews it every
few seconds; if it dies, the lease expires and another replica takes over. It
is active–passive, not load-balanced.

:::ar إزاي المكوّنات بتتواصل فعلاً؟
**١. الـ Watch مش الـ Poll**

الكنترولر الساذج كان هيسأل كل ثانية: «هاتلي كل البودات». ومع ٥٠٠٠ بود
دي كارثة.

اللي بيحصل فعلاً:

1. **LIST** — قراءة كاملة مرة واحدة، وبيبني منها **كاش في الرام**
2. **WATCH** — ستريم HTTP مفتوح طويل، والـ API server **بيدفع التغييرات بس**

**وفيه تفصيلتين تستاهلوا:**

- **الطابور بيشيل مفاتيح، مش أحداث.** خمس تغييرات سريعة على نفس الـ
  Deployment بيتجمّعوا في **مفتاح واحد**، وبيتعالج **مرة واحدة** مقابل
  الحالة النهائية. (وده الـ level-triggered اللي اتكلمنا عنه، بيطلع من
  التصميم لوحده.)
- لو الـ watch اتقطع أو اتأخر كتير، العميل بياخد `410 Gone` **وبيعمل
  LIST كامل من الأول**. فالصح **مضمون** مهما اتقطع الاتصال.

**٢. انتخاب القائد (Leader Election)**

الـ scheduler والـ controller-manager بيشتغلوا كذا نسخة للأمان، **بس
واحدة بس هي اللي بتتصرّف**.

**ليه؟** تخيّل schedulers اتنين بيربطوا نفس البود بنودين مختلفين. كارثة.

فبيتنافسوا على أوبجكت اسمه `Lease` في `kube-system`. اللي ماسكه بيجدّده
كل شوية، ولو مات، اللي بعده بياخده.

**يعني active–passive، مش توزيع حمل.** النسخ التانية قاعدة مستنية بس.

```sh
kubectl get lease -n kube-system kube-scheduler -o yaml   # مين ماسكه دلوقتي
```
:::

## What goes wrong

| Symptom | Which component | How to confirm |
|:---|:---|:---|
| `kubectl` hangs or times out | API server or network to it | `kubectl cluster-info`, `kubectl get --raw /healthz` |
| Everything `Pending`, no Events | Scheduler down or not leading | `kubectl get pods -n kube-system`, check its lease |
| `apply` succeeds, nothing happens | controller-manager down | Same; the absence of Events is the tell |
| Pods stuck `ContainerCreating` | **CNI or CSI**, not Kubernetes | `kubectl describe pod` → Events name the plugin |
| Node `NotReady` | kubelet stopped, or lost the API server | `systemctl status kubelet`, `journalctl -u kubelet` |
| Service routing broken on one node | kube-proxy on that node | `kubectl get pods -n kube-system -o wide \| grep proxy` |
| `etcdserver: request timed out` | etcd slow — almost always **disk latency** | etcd needs low-latency SSD; check `fsync` metrics |
| Random 500s from the API server | An admission **webhook** is failing | `kubectl get validatingwebhookconfigurations` |

:::danger An admission webhook can take the whole cluster down
A webhook with `failurePolicy: Fail` sits in the path of **every** matching
write. If its backing service is unavailable, those writes fail cluster-wide —
and if the webhook matches pods in `kube-system`, it can prevent the very pods
that would fix it from being created.

This is the classic self-inflicted total outage. Defences: scope webhooks
narrowly with `namespaceSelector` and `objectSelector`, exclude `kube-system`,
set a short `timeoutSeconds`, and use `failurePolicy: Ignore` unless the policy
is genuinely security-critical.
:::

:::ar الأعطال، ومين المسؤول
| العَرَض | المكوّن | تتأكد إزاي |
|:---|:---|:---|
| `kubectl` بيقعد مستني | الـ API server أو الشبكة ليه | `kubectl get --raw /healthz` |
| كله `Pending` ومفيش Events | الـ Scheduler واقع | `kubectl get pods -n kube-system` |
| الـ `apply` نجح ومفيش حاجة بتحصل | الـ controller-manager واقع | **غياب الـ Events هو الدليل** |
| بودات واقفة في `ContainerCreating` | **الـ CNI أو الـ CSI** | `describe pod` والـ Events هتسمّي الـ plugin |
| نود `NotReady` | الـ kubelet | `journalctl -u kubelet` |
| `etcdserver: request timed out` | etcd بطيئة — **تقريباً دايماً الديسك** | etcd محتاجة SSD سريعة |

:::danger و webhook واحد يقدر يوقّع الكلاستر كله
دي أشهر كارثة «بإيدينا» في كوبرنيتيس.

الـ webhook اللي `failurePolicy: Fail` بيقف في طريق **كل** كتابة مطابقة.
فلو السيرفيس اللي وراه وقع، **كل الكتابات دي بتفشل في الكلاستر كله**.

**والأسوأ:** لو الـ webhook بيطابق بودات في `kube-system` كمان، فهو
**بيمنع البودات اللي كانت هتصلّحه من إنها تتعمل أصلاً**. وتبقى في قفلة
مقفولة على نفسها.

**الدفاعات:**

- ضيّق نطاقه بـ `namespaceSelector` و `objectSelector`
- **استثني `kube-system`** دايماً
- `timeoutSeconds` قصير
- و `failurePolicy: Ignore` إلا لو السياسة **أمنية بجد**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Walk me through exactly what happens when you run `kubectl apply -f deploy.yaml`.
Answer as a chain of **watches**, not a list of components — that is the
distinction being tested.

1. **kubectl** reads `~/.kube/config` and POSTs the object over HTTPS. It is an
   ordinary HTTP client; nothing about it is privileged.
2. **API server** runs four gates in order: authentication → authorization
   (RBAC) → admission (mutating, then validating) → schema validation, then
   **writes to etcd**. It returns `201 Created`. *Nothing is running yet.*
3. **Deployment controller**, watching, sees a Deployment with no matching
   ReplicaSet and creates one.
4. **ReplicaSet controller**, watching, sees 0 of 3 pods and creates three Pod
   objects — still rows in etcd, with `spec.nodeName` empty.
5. **Scheduler**, watching for unbound pods, filters feasible nodes, scores
   them, and **binds** by writing `nodeName`. It never contacts the node.
6. **kubelet** on that node, watching for pods bound to itself, calls CNI for
   an IP, CRI to pull and run, CSI for volumes, then **PATCHes status** back.
7. **EndpointSlice controller** adds the now-Ready pod, and **kube-proxy** on
   every node reprograms its forwarding rules.

:::key The sentence that wins the question
"No component ever calls another component. Every one of those steps is a
controller noticing a difference between desired and actual state on a watch,
and acting to close it." Say that and the rest is detail.
:::

:::ar
جاوب على إنها **سلسلة مراقبة (watches)**، مش لستة مكوّنات — ده بالظبط
اللي بيتقاس.

١. **kubectl** بيقرا `~/.kube/config` وبيبعت الأوبجكت على HTTPS. **عميل
HTTP عادي**، مفيش فيه أي حاجة مميزة.

٢. **الـ API server** بيعدّي ٤ بوابات بالترتيب: هوية ← صلاحيات ← admission
(mutating وبعدين validating) ← تحقّق من الشكل، **وبعدين يكتب في etcd**.
ويرجّع `201`. **ولسه مفيش حاجة شغالة.**

٣. **Deployment controller** بيشوف Deployment من غير ReplicaSet، فيعمل واحدة.

٤. **ReplicaSet controller** بيشوف ٠ من ٣، فيعمل ٣ Pod objects — **لسه
صفوف في etcd** والـ `nodeName` فاضي.

٥. **الـ Scheduler** بيفلتر النودات، بينقّطها، **وبيربط** بإنه يكتب
`nodeName`. **وعمره ما بيكلّم النود.**

٦. **الـ kubelet** على النود دي بيشوف بود مربوط **بيه**، فينادي CNI عشان
IP، و CRI عشان ينزّل ويشغّل، و CSI للـ volumes، **وبعدين يبعت الحالة**.

٧. **EndpointSlice controller** بيضيف البود، و **kube-proxy على كل نود**
بيعيد كتابة القواعد.

**والجملة اللي بتكسب السؤال:**

> **«مفيش مكوّن بينادي على مكوّن تاني. كل خطوة فيهم دي كنترولر لاحظ فرق
> بين المطلوب والموجود وهو بيراقب، واتحرّك يقفل الفرق.»**

قول الجملة دي، والباقي تفاصيل.
:::
:::

:::q The control plane is completely down. Is the application down? · الـ control plane وقع
**No.** The data path does not go through the control plane.

| Still works | Why |
|:---|:---|
| Pods keep running | The kubelet supervises them locally |
| A crashed container restarts | The kubelet does that without asking anyone |
| Service traffic flows | Forwarding rules are already programmed on each node |
| DNS resolves | CoreDNS pods are just pods, already running |

| Stops | Why |
|:---|:---|
| Deploys, scaling, `kubectl` | Every write goes through the API server |
| Rescheduling after a node dies | That is a controller's job |
| New Service endpoints | The EndpointSlice controller is not running |
| Certificate rotation, secret updates | Also control-plane work |

:::key
"The control plane is the **change** path, not the **request** path." The real
danger is not immediate downtime — it is that your recovery mechanism is
unavailable at exactly the moment something else fails.
:::

:::ar
**لأ.** مسار الريكوست **مش بيمر على الـ control plane أصلاً**.

| لسه شغّال | ليه |
|:---|:---|
| البودات مكمّلة | الـ kubelet بيراقبهم **محلياً** |
| كونتينر مات ورجع | الـ kubelet بيعمل كده **من غير ما يسأل حد** |
| ترافيك الـ Services | القواعد **مكتوبة خلاص** على كل نود |
| الـ DNS | CoreDNS مجرد بودات، وهي شغالة |

| وقف | ليه |
|:---|:---|
| أي ديبلوي أو scaling أو `kubectl` | كل كتابة بتمر على الـ API server |
| نقل البودات لو نود وقعت | دي شغلة كنترولر |
| endpoints جديدة | الكنترولر بتاعها واقف |

**والجملة:** «الـ control plane مسار **التغيير**، مش مسار **الريكوست**».

**والخطر الحقيقي** مش إن الموقع يقع دلوقتي — الخطر إن **وسيلة الإنقاذ
بتاعتك مش موجودة** في اللحظة اللي حاجة تانية تبوظ فيها.
:::
:::

:::q Why does Kubernetes use a watch-based model instead of components calling each other?
Because a call-based system loses information on partial failure, and partial
failure is the normal state of a distributed system.

The property that matters is **level-triggered** versus **edge-triggered**:

| | Edge-triggered (events) | Level-triggered (state) |
|:---|:---|:---|
| Reacts to | "a pod was deleted" | "there are 2, I want 3" |
| Miss a message | Permanently wrong | Self-corrects on next read |
| Component restarts | Must replay history | Re-reads current state |
| Duplicate delivery | Double-acts | Idempotent by construction |

Consequences you should name:

- **Any controller can be killed and restarted** with no coordination — it
  re-LISTs and continues.
- **Reconciliation is idempotent**, so retries are free and require no
  deduplication logic.
- **Failure looks like silence**, not errors. A dead controller produces
  *nothing happening*, which is why `kubectl describe` showing no Events is
  itself a strong diagnostic signal.

:::ar
عشان النظام اللي بيعتمد على النداء **بيفقد معلومات مع الأعطال الجزئية**،
والأعطال الجزئية **هي الحالة الطبيعية** لأي نظام موزّع.

والخاصية اللي بتفرق: **level-triggered** مقابل **edge-triggered**.

| | edge (أحداث) | level (حالة) |
|:---|:---|:---|
| بيتفاعل مع | «بود اتمسح» | «فيه ٢ وأنا عايز ٣» |
| فاتتك رسالة | **غلط للأبد** | بيصحّح نفسه في القراءة الجاية |
| المكوّن قام تاني | لازم يعيد التاريخ | **بيقرأ الحالة الحالية** |
| رسالة وصلت مرتين | بيعمل الحاجة مرتين | **idempotent بطبيعته** |

**والنتايج اللي تسمّيها:**

- **أي كنترولر تقدر تقتله وترجّعه** من غير أي تنسيق.
- **التوفيق idempotent**، فإعادة المحاولة **مجانية** ومش محتاجة منطق
  لمنع التكرار.
- **والفشل شكله سكوت، مش أخطاء.** الكنترولر الميت بيعمل «**مفيش حاجة
  بتحصل**» — وعشان كده `kubectl describe` من غير Events **ده في حد ذاته
  إشارة تشخيصية قوية**.
:::
:::

:::q An admission webhook is down. What breaks, and how do you recover?
Depends entirely on `failurePolicy`:

- **`Ignore`** — the write proceeds without the webhook. Degraded policy
  enforcement, no outage.
- **`Fail`** — every matching write is rejected cluster-wide.

With `Fail`, the danger is a **deadlock**: if the webhook matches pods in
`kube-system`, you cannot create the pods that would restore the webhook.

**Recovery, in order:**

```sh
# 1. See which webhooks exist and what they match
kubectl get validatingwebhookconfigurations
kubectl get mutatingwebhookconfigurations

# 2. Is its backing service actually up?
kubectl get pods -n <webhook-namespace>

# 3. If you are locked out, delete the configuration. The webhook stops
#    being consulted immediately; reinstall it once the service is healthy.
kubectl delete validatingwebhookconfiguration <name>
```

**Prevention:** narrow `namespaceSelector`/`objectSelector`, always exclude
`kube-system`, short `timeoutSeconds` (the default 10s is a long time to add
to every write), and reserve `failurePolicy: Fail` for genuinely
security-critical policy.

:::ar
بيعتمد بالكامل على الـ `failurePolicy`:

- **`Ignore`** — الكتابة بتعدّي من غير الـ webhook. السياسة مش بتتطبّق،
  بس **مفيش انقطاع**.
- **`Fail`** — **كل كتابة مطابقة بتترفض في الكلاستر كله**.

**ومع `Fail` الخطر هو القفلة:** لو الـ webhook بيطابق بودات في
`kube-system`، إنت **مش قادر تعمل البودات اللي هتصلّحه**.

**الإنقاذ بالترتيب:**

```sh
kubectl get validatingwebhookconfigurations    # ١. مين موجود وبيطابق إيه
kubectl get pods -n <namespace-بتاعه>          # ٢. السيرفيس وراه شغّال؟
kubectl delete validatingwebhookconfiguration <name>   # ٣. لو مقفول عليك
```

مسح الـ configuration بيوقّف استشارة الـ webhook **فوراً**، وترجّعه بعد
ما تصلّح السيرفيس.

**والوقاية:** ضيّق النطاق، **استثني `kube-system`**، خلّي
`timeoutSeconds` قصير (الافتراضي ١٠ ثواني، ودي مدة طويلة تتزاد على **كل**
كتابة)، **و `failurePolicy: Fail` للسياسات الأمنية بس**.
:::
:::

## Key takeaways

- **Nothing calls anything.** Every component watches the API server and
  reconciles a difference. That one sentence is the architecture.
- **The API server is the only door**, and it runs authn → authz → admission →
  validation → write, in that order.
- **`created` means "recorded in etcd"**, not "running". Always wait for
  `rollout status`.
- **The scheduler only writes `nodeName`.** It never contacts a node; the
  kubelet notices the binding itself.
- **Level-triggered, not edge-triggered** — which is why any controller can be
  killed and restarted with nothing lost.
- **The control plane is the change path, not the request path.** Running pods
  survive its loss; your ability to fix anything does not.
- **`ContainerCreating` usually means CNI or CSI**, not Kubernetes itself.
- **A `failurePolicy: Fail` webhook can deadlock the cluster.** Exclude
  `kube-system`.

:::ar الخلاصة
1. **مفيش حاجة بتنادي حاجة.** كل مكوّن بيراقب الـ API server وبيقفل فرق.
   **الجملة دي هي المعمارية كلها.**
2. **الـ API server هو الباب الوحيد**، وبيمشي: هوية ← صلاحيات ← admission
   ← تحقّق ← كتابة. **بالترتيب ده.**
3. **`created` معناها «اتسجّلت في etcd»**، مش «شغالة». استنى
   `rollout status` دايماً.
4. **الـ Scheduler بيكتب `nodeName` وبس.** عمره ما بيكلّم نود —
   **الـ kubelet هو اللي بيلاحظ الربط**.
5. **Level-triggered مش edge-triggered** — وعشان كده تقدر تقتل أي كنترولر
   وترجّعه **ومفيش حاجة بتضيع**.
6. **الـ control plane مسار التغيير مش مسار الريكوست.** البودات بتعيش
   من غيره، **وقدرتك على الإصلاح لأ**.
7. **`ContainerCreating` غالباً CNI أو CSI**، مش كوبرنيتيس نفسه.
8. **webhook بـ `failurePolicy: Fail` يقدر يقفل الكلاستر على نفسه.**
   **استثني `kube-system`.**
:::
