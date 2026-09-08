---
title: Kubernetes Basics
slug: kubernetes-basics
type: guide
domain: 03-kubernetes
tags: [kubernetes, k8s, orchestration]
keywords: [k8s, kubectl, cluster, node, control plane, api server, etcd,
           scheduler, kubelet, manifest, yaml, reconciliation, labels,
           requests, limits, oomkilled, namespace,
           كوبرنيتيس, كلاستر, بود, نود, عقدة]
level: 1
status: stable
prerequisites: [docker]
related: [kubernetes-pods, kubernetes-deployments, kubectl-commands,
          devops-interview-questions]
updated: 2026-09-08
---

# Kubernetes Basics

> You describe what you want running; Kubernetes keeps making reality match that description. Everything else is detail.

## What is it?

Kubernetes (often "K8s") runs containers across many machines for you. You hand
it a description — "I want 3 copies of this image, reachable on port 80" — and
it decides where they run, restarts them when they crash, and replaces them when
a machine dies.

Docker runs a container on **one** machine. Kubernetes runs containers across
**many**, and keeps them running without you watching.

:::ar
تعال ناخدها بالراحة خالص.

**دوكر** بيشغّل كونتينر على **ماكينة واحدة**. إنت بتقوله «شغّل ده» وهو
بيشغّله. لو مات، بيفضل ميت لحد ما إنت تشغّله تاني.

**كوبرنيتيس** بيشغّل كونتينرات على **ماكينات كتير**، وبيقعد يراقبهم بدالك.

وأهم فرق في طريقة الكلام معاه:

| مع دوكر | مع كوبرنيتيس |
|:---|:---|
| «**اعمل** كذا» — أوامر | «أنا **عايز** الوضع يبقى كذا» — وصف |
| مات؟ يفضل ميت | مات؟ بيرجّعه لوحده |
| السيرفر وقع؟ إنت اللي تنقل | السيرفر وقع؟ بينقلهم لسيرفر تاني |

يعني إنت مش بتقوله «شغّل ٣ كونتينرات». إنت بتقوله: **«أنا عايز يكون فيه ٣
نُسخ من الصورة دي شغالة على طول»**. وبعد كده هو مسؤوليته إن الرقم ده
يفضل ٣، سواء ماتت واحدة، أو وقع سيرفر، أو حصل أي حاجة.

**والفرق ده هو كل الحكاية.** إنت بتوصف، مش بتأمر.
:::

## Why it exists

With a handful of containers on one server, `docker compose` is enough. The
problems appear at scale:

| Problem | What you'd do by hand | Kubernetes |
|:---|:---|:---|
| A container crashes at 3am | Get paged, SSH in, restart | Restarts it automatically |
| A whole server dies | Manually move everything | Reschedules onto healthy nodes |
| Traffic tripled | Manually start more copies | Autoscales |
| Deploy a new version | Stop old, start new, hope | Rolling update, automatic rollback |
| Where is there room for this? | Track capacity in a spreadsheet | The scheduler decides |

:::key The one idea underneath everything: reconciliation
You never tell Kubernetes to *do* something. You tell it what the world should
look like, and controllers continuously compare **desired state** against
**actual state** and close the gap.

```diagram
   you: "3 replicas"  →  DESIRED STATE (stored in etcd)
                                │
                                │  controllers compare, forever
                                ↓
                          ACTUAL STATE: 2 running
                                │
                                ↓
                          action: start 1 more
```

This is why deleting a pod does not remove it — a controller notices the gap and
makes a new one. To actually remove it you change the *desired state* (delete
the Deployment). Grasp this and Kubernetes stops feeling arbitrary.
:::

:::ar بالمصري · الفكرة الوحيدة اللي لو فهمتها فهمت كل حاجة
الفكرة دي اسمها **reconciliation** — يعني «التوفيق» أو «إصلاح الفرق».

**إنت عمرك ما بتقول لكوبرنيتيس «اعمل حاجة».** إنت بتقوله «الدنيا لازم
تبقى شكلها كذا»، وبعد كده فيه برامج صغيرة اسمها **controllers** قاعدة
بتقارن على طول:

```diagram
   إنت كتبت: "٣ نُسخ"
        │
        ↓
   المطلوب (desired) = ٣        ←── مكتوبة في etcd
        │
        │   الكنترولر بيقارن... كل ثانية... للأبد
        ↓
   الموجود (actual) = ٢
        │
        ↓
   فيه فرق؟ إذن: شغّل واحدة كمان
        │
        ↓
   المطلوب = الموجود = ٣  →  الكنترولر يسكت ويستنى
```

**وهنا بتفهم حاجة كانت بتلخبطك:**

تعمل `kubectl delete pod my-pod` — البود بيتمسح، وبعد ثانيتين **بيرجع تاني**
باسم جديد. وإنت مستغرب: «أنا مسحته!»

إنت مسحت **الموجود**، بس **المطلوب** لسه مكتوب ٣. فالكنترولر شاف ٢ من ٣،
وعمل واحدة جديدة. **إنت ما مسحتش حاجة، إنت بس عملت شغل للكنترولر.**

عايز تمسحه فعلاً؟ **غيّر المطلوب** — امسح الـ Deployment نفسها، أو نزّل
الرقم لصفر:

```sh
kubectl scale deploy/web --replicas=0    # المطلوب بقى صفر
kubectl delete deploy web                # المطلوب مبقى موجود خالص
```

ولما تفهم الفكرة دي، كوبرنيتيس بيبطّل يبان عبيط، وكل حاجة بعدها بتبقى منطقية.
:::

## What it is made of

A cluster has two halves.

```diagram
┌───────────────────── CONTROL PLANE (the brain) ──────────────────────┐
│                                                                      │
│   ┌────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────────┐  │
│   │  etcd  │←→ │  API SERVER  │←→ │ Scheduler │   │ Controllers  │  │
│   └────────┘   └──────────────┘   └───────────┘   └──────────────┘  │
│    stores       the front door      picks a         keep desired    │
│    all state    for everything      node            = actual        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   NODE 1     │   │   NODE 2     │   │   NODE 3     │   ← workers
│  kubelet     │   │  kubelet     │   │  kubelet     │
│  kube-proxy  │   │  kube-proxy  │   │  kube-proxy  │
│  [pods...]   │   │  [pods...]   │   │  [pods...]   │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Control plane

| Component | Job | If it stops |
|:---|:---|:---|
| **API server** | The only way in. Everything talks to it | No changes possible; running pods keep running |
| **etcd** | Database holding all cluster state | The cluster loses its memory. Back this up |
| **Scheduler** | Chooses which node a new pod goes on | New pods stay `Pending`; existing ones fine |
| **Controllers** | Reconcile desired vs actual | Deploys stall silently |

### Worker nodes

| Component | Job |
|:---|:---|
| **kubelet** | The agent on each node. Starts and watches containers |
| **kube-proxy** | Sets up networking so Services work |
| **Container runtime** | Actually runs containers (containerd) |

:::ar بالمصري · الكلاستر نصين، والنصين ليهم أدوار مختلفة
تخيل شركة:

- **الـ Control Plane = الإدارة.** بتقرر مين يشتغل فين، وبتسجّل كل حاجة،
  وبتراقب. **بس هي نفسها مش بتشتغل الشغل.**
- **الـ Nodes = الموظفين.** دول اللي فعلاً شايلين البودات وبيشغّلوها.

| المكوّن | شغلته | لو وقع يحصل إيه |
|:---|:---|:---|
| **API server** | الباب الوحيد للكلاستر. كل حاجة بتمر عليه | مش هتقدر تغيّر حاجة. اللي شغّال يفضل شغّال |
| **etcd** | الداتابيز اللي فيها كل حالة الكلاستر | الكلاستر بينسى نفسه. **خُد باك أب!** |
| **Scheduler** | بيختار البود الجديد يقعد على أنهي نود | البودات الجديدة تقعد `Pending` |
| **Controllers** | بيوفّقوا المطلوب مع الموجود | الديبلويات بتتعلّق **في سكوت** |
| **kubelet** | الموظف على كل نود، بيشغّل الكونتينرات ويراقبهم | النود دي بتبقى ميتة عملياً |
| **kube-proxy** | بيظبّط الشبكة عشان الـ Services تشتغل | الترافيك مش بيوصل للبودات |

:::note الـ Control Plane وقع؟ التطبيق بتاعك **لسه شغّال**
دي حاجة بتفاجئ الناس، وسؤال انترفيو مشهور.

لو الـ control plane كله وقع، البودات اللي شغالة **بتفضل شغالة**، والترافيك
بيفضل ماشي. ليه؟ عشان القواعد **مكتوبة خلاص على كل نود**، والـ kubelet
بيقدر يرجّع كونتينر مات من غير ما يسأل حد.

اللي بتخسره هو القدرة على **التغيير**: مفيش ديبلوي، مفيش scaling، ولو نود
وقعت محدش هينقل بوداتها.

**والخطر الحقيقي مش إن الموقع يقع دلوقتي.** الخطر إن **وسيلة الإنقاذ**
بتاعتك مش موجودة بالظبط في الوقت اللي حاجة تانية تبوظ فيه.
:::
:::

:::note Control plane down does not mean your app is down
Running pods keep serving and Service traffic keeps flowing, because the rules
are already in place on each node. kubelet even restarts crashed containers
locally without asking anyone.

What you lose is the ability to **change** things: no deploys, no scaling, no
rescheduling if a node dies. The danger is not immediate downtime — it is that
your recovery mechanism is unavailable exactly when something else breaks.
:::

## The objects you will use

You describe everything in YAML. These are the ones you actually need:

| Object | What it is | Analogy |
|:---|:---|:---|
| **Pod** | One or more containers that run together | A single running instance |
| **Deployment** | Keeps N identical pods running; handles updates | A manager of pods |
| **Service** | A stable address for a group of pods | A receptionist |
| **Ingress** | Routes external HTTP traffic to Services | The front door |
| **ConfigMap** | Non-secret configuration | A settings file |
| **Secret** | Passwords, keys, tokens | A locked drawer |
| **Namespace** | A folder for grouping objects | A project folder |

```diagram
   internet
      │
      ↓
   Ingress          "example.com/api  →  the api Service"
      │
      ↓
   Service          stable IP + DNS name; picks a healthy pod
      │
      ├──→ Pod ─┐
      ├──→ Pod  ├─ all created and watched by one Deployment
      └──→ Pod ─┘
```

You almost never create a Pod directly. You create a **Deployment**, and it
creates the Pods.

:::ar بالمصري · الأوبجكتس اللي هتستخدمها فعلاً
كوبرنيتيس فيه حوالي ٥٠ نوع أوبجكت. إنت محتاج **٧** منهم في الشغل اليومي:

| الأوبجكت | يعني إيه | تخيلها زي |
|:---|:---|:---|
| **Pod** | كونتينر أو أكتر شغالين مع بعض | نسخة واحدة شغالة |
| **Deployment** | بتحافظ على عدد نُسخ، وبتعمل التحديثات | المدير بتاع البودات |
| **Service** | عنوان ثابت لمجموعة بودات | الريسبشن |
| **Ingress** | بيوجّه الترافيك الجاي من بره للسيرفيسات | الباب الرئيسي للمبنى |
| **ConfigMap** | إعدادات مش سرية | ملف settings |
| **Secret** | باسوردات ومفاتيح وتوكنز | درج بمفتاح |
| **Namespace** | فولدر بتجمّع فيه أوبجكتس | فولدر المشروع |

**وأهم حاجة تفتكرها:** إنت **عمرك ما بتعمل Pod بإيدك**. إنت بتعمل
**Deployment**، وهي اللي بتعمل البودات.

ليه؟ عشان البود لوحده **يتيم** — لو مات، مفيش حد مسؤول يرجّعه. أما البود
اللي الـ Deployment عملته، فيه حد بيراقبه.

```diagram
   بتعمل Pod بإيدك              بتعمل Deployment
   ──────────────                ────────────────
   Pod                           Deployment
    │                                │  بتعمل
    │  مات                            ↓
    ↓                             ReplicaSet
   خلاص. يفضل ميت.                    │  بتعمل
   محدش مسؤول عنه.                    ↓
                                    Pod  ─── مات؟
                                          الـ ReplicaSet تشوف ٢ من ٣
                                          وتعمل واحد جديد فوراً
```
:::

## How to use it

### Talking to the cluster

`kubectl` is the command-line tool. Everything goes through it.

```sh title="Orientation — run these first on any new cluster"
kubectl cluster-info            # is the cluster reachable?
kubectl get nodes               # the machines. All should be Ready
kubectl get pods                # pods in the CURRENT namespace
kubectl get pods -A             # every namespace
kubectl get all                 # most object types in this namespace
```

:::warn Almost every command is namespace-scoped
`kubectl get pods` shows only the **current** namespace, which defaults to
`default`. Your pods are probably somewhere else — this is why beginners see an
empty list on a busy cluster.

```sh
kubectl get pods -A                        # look everywhere
kubectl get pods -n production             # a specific namespace
kubectl config set-context --current --namespace=production   # change the default
```
:::

:::ar
الحاجة دي بتحصل لكل حد في أول أسبوع، فخد بالك منها.

بتكتب `kubectl get pods` وبتلاقي اللستة **فاضية**، وإنت متأكد إن فيه ٥٠ بود
شغّالين على الكلاستر.

السبب إن `kubectl get pods` بيوريك **الـ namespace الحالي بس**، والافتراضي
اسمه `default`. وبودات الشغل بتبقى في namespace تاني خالص زي `production`.

```sh
kubectl get pods -A                  # وريني كل حاجة في كل مكان
kubectl get pods -n production       # وريني namespace معيّن
```

ولو تعبت من إنك تكتب `-n production` كل مرة، غيّر الافتراضي:

```sh
kubectl config set-context --current --namespace=production
```

**نصيحة عملية:** نصّب حاجة اسمها `kubectx` و `kubens`. بيخلّوك تنقل بين
الكلاسترات والـ namespaces بكلمة واحدة. ودي أول حاجة أي حد بيشتغل على
كوبرنيتيس بجد بينصّبها.
:::

### Deploying something

Write a manifest:

```yaml title="deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                  # desired state: three pods
  selector:
    matchLabels:
      app: web                 # which pods this Deployment owns
  template:                    # the recipe for each pod
    metadata:
      labels:
        app: web               # MUST match the selector above
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          resources:
            requests:          # what it is guaranteed
              memory: "64Mi"
              cpu: "100m"      # 100m = 0.1 of a CPU core
            limits:            # what it may never exceed
              memory: "128Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web                   # sends traffic to pods with this label
  ports:
    - port: 80
      targetPort: 80
```

Apply it:

```sh
kubectl apply -f deployment.yaml     # create or update. Use this, not `create`
kubectl get pods -l app=web          # see the three pods
kubectl rollout status deploy/web    # wait for the rollout to finish
```

`kubectl apply` is **declarative** — run it repeatedly and you converge on the
file's contents. `kubectl create` fails if the object exists. Always use `apply`.

:::ar بالمصري · اقرأ الـ YAML ده بالراحة، سطر بسطر
الـ YAML بيخوّف في الأول عشان شكله كتير. بس هو ٤ أسئلة بس:

| السطر | بيجاوب على سؤال إيه |
|:---|:---|
| `kind: Deployment` | **إيه** نوع الحاجة اللي بتعملها |
| `metadata.name: web` | **اسمها** إيه |
| `spec.replicas: 3` | عايز **كام** نسخة |
| `spec.template` | كل نسخة شكلها **إيه** |

والحاجة اللي بتوقّع الناس هي **الـ selector والـ labels**:

```diagram
   spec:
     selector:
       matchLabels:
         app: web      ←──┐
     template:            │  الاتنين دول لازم
       metadata:          │  يكونوا متطابقين
         labels:          │  بالحرف
           app: web    ←──┘
```

الـ `selector` معناها «الـ Deployment دي مسؤولة عن أنهي بودات؟»، والـ
`labels` جوه الـ `template` هي الاستيكر اللي بيتلزق على كل بود بتتعمل.

**لو الاتنين مش متطابقين، الـ Deployment بتعمل بودات ومش بتعرف إنها بتاعتها.**
والنتيجة إنها تعمل بودات على بودات على بودات، أو متعملش حاجة خالص.

**و `apply` مش `create`:**

| | `kubectl create` | `kubectl apply` |
|:---|:---|:---|
| الحاجة موجودة خلاص | **بيفشل** ويقولك موجودة | بيعدّلها للي في الملف |
| تشغّله ١٠ مرات | يفشل ٩ مرات | نفس النتيجة كل مرة |

استخدم `apply` **دايماً**، حتى في أول مرة. ده معناه إنك تقدر تعدّل الملف
وتعيد نفس الأمر بالظبط، وده أساس شغل الـ GitOps كله.
:::

### Labels are the glue

Nothing in Kubernetes is linked by name. Objects find each other by **labels**.

```diagram
   Service  selector: app=web
                │
                │  "give me every pod labelled app=web"
                ↓
   Pod app=web ✓     Pod app=web ✓     Pod app=api ✗
```

:::danger A typo in a label breaks everything silently
If a Service's `selector` does not match the pods' `labels`, the Service is
created successfully, resolves in DNS, accepts connections — and times out,
because it has no backends.

There is no error message. One command tells you:

```sh
kubectl get endpoints web
# NAME   ENDPOINTS                          AGE
# web    10.1.0.4:80,10.1.0.5:80,...        2m     ← good
# web    <none>                             2m     ← the selector matches nothing
```

**`<none>` in ENDPOINTS is the single most common Kubernetes bug.** Check it
before anything else.
:::

:::ar بالمصري · الـ labels هي اللي ماسكة كل حاجة
حاجة غريبة في كوبرنيتيس: **مفيش حاجة مربوطة بحاجة بالاسم.** كله بيلاقي كله
بالـ **labels** — يعني استيكرز.

الـ Service مش مكتوب فيها «ابعت للبودات دي وديه وديه». مكتوب فيها:
**«ابعت لأي بود عليه استيكر `app=web`»**.

```diagram
   Service   selector: app=web
                │
                │  "هاتلي أي بود عليه الاستيكر ده"
                ↓
   Pod app=web ✓     Pod app=web ✓     Pod app=api ✗
                                         (استيكر تاني، مش بتاعي)
```

**والفايدة:** إنك تقدر تضيف بودات وتشيل بودات وتغيّر أسماءها، والـ Service
مش محتاجة تعرف حاجة. أي بود عليه الاستيكر الصح بياخد ترافيك تلقائياً.

**والخطر:** لو غلطت حرف في الاستيكر، **مفيش أي رسالة إيرور.**

الـ Service بتتعمل بنجاح، وبتظهر في الـ DNS، وبتقبل الكونيكشن... وبعدين
بتقعد تنتظر لحد ما الوقت يخلص. عشان مفيش أي بود وراها.

:::danger الأمر الواحد اللي يكشفلك ده
```sh
kubectl get endpoints web
```

- لو شوفت أرقام IP → تمام، الـ Service لاقية بودات.
- لو شوفت **`<none>`** → الـ selector مش مطابق حاجة.

**دي أشهر مشكلة في كوبرنيتيس على الإطلاق**، ودي أول حاجة تشيكها قبل أي
حاجة تانية. ولو الأرقام موجودة، يبقى المشكلة مش في الـ labels ودوّر
في حاجة تانية.

عايز تقارن بنفسك؟
```sh
kubectl get pods --show-labels          # الاستيكرز اللي على البودات
kubectl describe svc web | grep Selector  # اللي الـ Service بتدوّر عليه
```
:::
:::

### Day-to-day commands

```sh
kubectl describe pod <name>     # events + state. FIRST command when something is wrong
kubectl logs <pod>              # its output
kubectl logs <pod> -f           # follow
kubectl logs <pod> --previous   # the CRASHED container's logs, not the new one
kubectl exec -it <pod> -- sh    # shell inside the pod

kubectl scale deploy/web --replicas=5
kubectl rollout restart deploy/web    # restart all pods (picks up new config)
kubectl rollout undo deploy/web       # roll back to the previous version

kubectl delete -f deployment.yaml     # remove what the file created
```

`kubectl describe` is the most valuable debugging command. The **Events** at the
bottom usually name the problem outright: image pull failure, insufficient
memory, failing probe, missing ConfigMap.

### Requests and limits

These two numbers matter more than almost anything else:

| | Meaning | Effect |
|:---|:---|:---|
| **request** | Guaranteed minimum | Used by the scheduler to pick a node |
| **limit** | Hard ceiling | Exceeding memory → **killed**; exceeding CPU → **throttled** |

:::warn Memory limits kill, CPU limits slow down
Exceeding a **memory** limit means the kernel kills the container instantly —
`OOMKilled`, exit code 137, no cleanup.

Exceeding a **CPU** limit does not kill anything. The container is paused for
the rest of a 100ms window. The result is latency, and — the confusing part —
CPU usage graphs look **low**, because frozen time is not counted as usage.

So "the app is slow but CPU looks fine" is often a CPU limit set too low.
:::

:::ar بالمصري · الرقمين دول أهم من أي حاجة تانية
| | `requests` | `limits` |
|:---|:---|:---|
| معناها | الحد الأدنى **المضمون** ليك | السقف اللي **ممنوع** تعدّيه |
| مين بيستخدمها | الـ **Scheduler** عشان يختار نود | الـ **Kernel** وقت التشغيل |
| متى بتشتغل | مرة واحدة، وقت التوزيع | على طول، كل لحظة |

خلّينا نبسّطها: **الـ `request` هي الحجز، والـ `limit` هي القفل.**

الـ `request` بتقول للـ Scheduler «أنا محتاج ٦٤ ميجا عشان أشتغل» — فهو
بيدوّر على نود فيها ٦٤ ميجا فاضية ويحطك فيها. بعد كده الرقم ده خلص شغلته.

الـ `limit` بتقول للكيرنل «الكونتينر ده ممنوع يتعدى ١٢٨ ميجا» — والكيرنل
بيقعد يراقب طول عمر الكونتينر.

:::danger وحد الرام وحد المعالج **بيفشلوا بشكل مختلف تماماً**
دي أهم حاجة في القسم ده، وسؤال انترفيو متكرر جداً:

```diagram
   تعدّيت حد الرام              تعدّيت حد المعالج
   ─────────────────             ──────────────────
   الكيرنل بيقتل الكونتينر       الكيرنل بيوقّف الكونتينر
   فوراً وخلاص                   لباقي نافذة الـ 100ms
        │                              │
        ↓                              ↓
   OOMKilled                     الكونتينر عايش... بس بطيء
   exit code 137                        │
   واضح جداً في الـ describe            ↓
                                 ومفيش أي رسالة في أي حتة
```

**ليه الرام بتقتل والمعالج لأ؟** عشان الرام **مش بتتقسّم على الوقت**. لو
البرنامج كتب في الرام، الرام دي محجوزة خلاص. أما المعالج فبيتقسّم على الوقت،
فالكيرنل بيقدر يقولك «استنى شويه» وخلاص.

**والجزء اللي بيلخبط الناس:** لما الكونتينر يتخنق على المعالج، **الجرافات
بتبان واطية!** عشان الوقت اللي هو كان مجمّد فيه **مش بيتحسب** كاستخدام.

فلو حد قالك «التطبيق بطيء بس المعالج مبيّن عادي» — دوّر على CPU limit
محطوط واطي. ودي مشكلة بتقعد شهور من غير ما حد يكتشفها.
:::
:::

Setting no requests at all means the scheduler is guessing, and your pods are
first to be evicted when a node runs short.

:::ar
ولو مكتبتش `requests` خالص؟ حاجتين بيحصلوا:

1. **الـ Scheduler بيخمّن.** بيحطك على أي نود، وممكن يحطك على نود مليانة
   خلاص، وتقعد تتخانق على الموارد.
2. **بودك أول واحد يتشال** لما النود تزنق. كوبرنيتيس بيرتّب البودات في
   تلات درجات، والبود اللي مش كاتب `requests` في أدنى درجة (`BestEffort`)
   — يعني أول واحد يطير.

يعني «مش كاتب حدود» **مش** معناها «حر ومرتاح». معناها **«في آخر الصف»**.
:::

## What goes wrong first

| Pod status | Meaning | First command |
|:---|:---|:---|
| `Pending` | Not scheduled — no node has room, or a volume is missing | `kubectl describe pod` → Events |
| `ImagePullBackOff` | Cannot fetch the image: wrong name, tag, or no credentials | `kubectl describe pod` |
| `CrashLoopBackOff` | Starts, exits, restarts, repeatedly | `kubectl logs <pod> --previous` |
| `OOMKilled` | Exceeded its memory limit | Raise the limit, or fix the leak |
| `Running` but not working | Often a Service/label problem | `kubectl get endpoints` |

:::ar بالمصري · جدول تشخيص سريع
اقرأ حالة البود، وامشي على السهم:

```diagram
   Pending             →  محدش لقاله مكان
                          describe pod → Events
                          (نود مليانة؟ volume ناقص؟ taint؟)

   ImagePullBackOff    →  مش قادر ينزّل الصورة
                          اسم غلط؟ تاج غلط؟ مفيش صلاحية للـ registry؟

   CrashLoopBackOff    →  بيقوم، يموت، يقوم، يموت
                          logs --previous  ← الـ --previous دي المهمة!
                          (عشان logs العادية بتوريك الكونتينر الجديد)

   OOMKilled           →  عدّى حد الرام. exit 137
                          إما ترفع الحد، وإما تظبّط الـ leak

   Running بس مش شغّال →  ٩٠٪ مشكلة labels
                          get endpoints  ← لو <none> دي هي
```

**والأمر اللي بيحل أغلب المشاكل:** `kubectl describe pod <name>`.

انزل تحت لآخر الصفحة على قسم **Events** — هو حرفياً بيكتبلك المشكلة بالكلام:
الصورة مش موجودة، الرام مش كفاية، الـ probe بتفشل، الـ ConfigMap ناقصة.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q The control plane is completely down. Is my application down? · الـ control plane وقع، الموقع واقع؟
**No — and this is the question that separates people who have operated a
cluster from people who have read about one.**

Running pods keep serving traffic, because the data path does not go through
the control plane:

| Still works | Because |
|:---|:---|
| Pods keep running | The kubelet on each node supervises them locally |
| A crashed container restarts | The kubelet does this without asking anyone |
| Service traffic flows | The forwarding rules are already programmed on each node |
| DNS resolves | CoreDNS pods are just pods, already running |

| Stops working | Because |
|:---|:---|
| Deploys, scaling, `kubectl` | Every write goes through the API server |
| Rescheduling after a node dies | That is a controller's job |
| New Service endpoints | The endpoints controller is not running |

:::key The point to land
"The control plane is the *change* path, not the *request* path." The real
danger is not immediate downtime — it is that your recovery mechanism is
unavailable at exactly the moment something else fails. That is why control
plane availability matters even though it is not in the request path.
:::

:::ar
**لأ، والموقع شغّال.** والسؤال ده بيفرّق بين اللي شغّل كلاستر فعلاً واللي
قرأ عنه بس.

البودات الشغالة بتفضل شغالة، عشان **مسار الريكوست مش بيمر على الـ control
plane أصلاً**.

| لسه شغّال | ليه |
|:---|:---|
| البودات مكمّلة | الـ kubelet على كل نود بيراقبهم محلياً |
| كونتينر مات ورجع | الـ kubelet بيعمل كده من غير ما يسأل حد |
| ترافيك الـ Services | القواعد مكتوبة خلاص على كل نود |
| الـ DNS بيترجم | CoreDNS مجرد بودات، وهي شغالة أصلاً |

| بطّل يشتغل | ليه |
|:---|:---|
| أي ديبلوي أو scaling أو `kubectl` | كل كتابة بتمر على الـ API server |
| نقل البودات لو نود وقعت | دي شغلة كنترولر |
| endpoints جديدة لأي Service | الكنترولر بتاعها واقف |

**والجملة اللي تقولها:** «الـ control plane هو مسار **التغيير**، مش مسار
**الريكوست**».

**والخطر الحقيقي** مش إن الموقع يقع دلوقتي — الخطر إن **وسيلة الإنقاذ**
بتاعتك مش موجودة بالظبط في اللحظة اللي حاجة تانية تبوظ فيها.
:::
:::

:::q Why does a memory limit kill the container but a CPU limit does not?
Because memory cannot be time-shared and CPU can.

If a process has written a page of memory, that page is occupied — the kernel
cannot give it to someone else and hand it back a millisecond later. The only
way to enforce a memory ceiling is to stop the process existing. So the
cgroup OOM killer terminates it: `OOMKilled`, exit code 137.

CPU is a rate, not a quantity. The CFS scheduler enforces a limit by giving
the cgroup a quota per 100 ms period and freezing it once spent.

```diagram
   CPU limit 500m = 50ms of every 100ms period

   |█████████████·············|█████████████·············|
    0        50ms        100ms  0        50ms        100ms
    running   THROTTLED         running   THROTTLED

   The app is alive the whole time. It is just not scheduled
   for half of it — which shows up as latency, not as an error.
```

:::warn Why this is hard to detect
Throttled time is **not counted as CPU usage**, so utilisation graphs look
comfortable while p99 latency is terrible. The metric that reveals it is
`container_cpu_cfs_throttled_seconds_total`. A candidate who names that
metric has debugged this for real.
:::

:::ar
عشان **الرام مش بتتقسّم على الوقت، والمعالج بيتقسّم**.

لو برنامج كتب صفحة رام، الصفحة دي محجوزة. الكيرنل مش ممكن يديها لحد تاني
ويرجّعها بعد جزء من الثانية. فالطريقة الوحيدة إنه يفرض سقف للرام هي إنه
**يوقّف البرنامج عن الوجود**. وعشان كده بيقتله: `OOMKilled` وكود ١٣٧.

أما المعالج فهو **معدّل** مش كمية. فالكيرنل بيدي الـ cgroup حصة في كل
١٠٠ مللي ثانية، وأول ما تخلص بيجمّده لباقي النافذة.

بص على الرسمة اللي فوق: البرنامج **عايش طول الوقت**، هو بس مش شغّال في
نص الوقت — وده بيبان كـ **بطء**، مش كـ **إيرور**.

**وليه دي صعبة الاكتشاف؟** عشان الوقت المجمّد **مش بيتحسب استخدام معالج**،
فالجرافات بتبان مرتاحة والـ latency زفت.

والمقياس اللي بيكشفها هو `container_cpu_cfs_throttled_seconds_total`.
واللي بيسمّي المقياس ده بالاسم، ده واحد ظبّط المشكلة دي بإيده فعلاً.
:::
:::

:::q You delete a Pod and it comes back. You delete it again — same thing. What is happening, and how do you actually remove it?
Nothing is wrong. You are fighting a reconciliation loop and it will always
win.

`kubectl delete pod` changes **actual** state. The Deployment's `replicas: 3`
is **desired** state, stored in etcd and untouched by your delete. The
ReplicaSet controller sees 2 of 3, and creates one.

To remove it you must change desired state:

```sh
kubectl scale deploy/web --replicas=0   # desired is now 0
kubectl delete deploy web               # desired no longer exists
```

:::key The follow-up they usually ask
"So what is `kubectl delete pod` actually *for*?" It is for forcing a
replacement — evicting a pod from a bad node, or restarting one that is
wedged. You are using the loop deliberately: delete the broken instance and
let the controller build a fresh one. `kubectl rollout restart deploy/web`
does the same thing for all pods, in a controlled order.
:::

:::ar
مفيش حاجة غلط. إنت بتتخانق مع حلقة تحكّم، وهي هتكسبك دايماً.

`kubectl delete pod` بيغيّر **الموجود**. أما `replicas: 3` فهي **المطلوب**،
ومكتوبة في etcd، والـ delete بتاعك ما لمسهاش. فالكنترولر شاف ٢ من ٣ وعمل واحد.

عشان تمسحه فعلاً، **غيّر المطلوب**:

```sh
kubectl scale deploy/web --replicas=0
kubectl delete deploy web
```

**والسؤال اللي بيجي بعده عادةً:** «أمال `kubectl delete pod` بتستخدم في إيه؟»

بتستخدمها عشان **تفرض استبدال**: تشيل بود من على نود تعبانة، أو ترجّع بود
معلّق. يعني إنت بتستغل الحلقة **بقصد**: امسح النسخة الباظت وسيب الكنترولر
يعملك واحدة جديدة نضيفة.

و `kubectl rollout restart deploy/web` بتعمل نفس الحاجة بالظبط لكل البودات،
بس بترتيب محكوم عشان الخدمة متقعش.
:::
:::

:::q What is the difference between `Running` and `Ready`, and which one does a Service care about?
`Running` means the container process started. `Ready` means the readiness
probe is passing. **A Service only routes to `Ready` pods.**

```diagram
   Pod lifecycle
   ─────────────
   Pending  →  ContainerCreating  →  Running  →  Running + Ready
                                       │              │
                                       │              └── NOW in the
                                       │                  EndpointSlice,
                                       │                  NOW gets traffic
                                       └── process is up, but the app may
                                           still be loading config, warming
                                           a cache, connecting to the DB
```

This is what readiness probes are *for*: the gap between "the process
exists" and "the application can serve a request". An app with no readiness
probe is marked Ready the instant the process starts, so a rolling update
sends traffic to pods that are still booting — and you get a burst of 502s
on every deploy that nobody can explain.

| Probe | Fails → | Use it for |
|:---|:---|:---|
| `readinessProbe` | Removed from the Service, **not** restarted | "Can I serve traffic right now?" |
| `livenessProbe` | Container is **restarted** | "Am I wedged and beyond saving?" |
| `startupProbe` | Holds off the other two | Slow-starting apps (JVM, big migrations) |

:::danger The classic mistake: the same endpoint for liveness and readiness
Point both at `/health`, have `/health` check the database, and the moment
the database has a blip **every pod fails liveness and Kubernetes restarts
your entire fleet** — turning a recoverable dependency blip into a full
outage, and adding a thundering herd of reconnects on top.

Liveness should check only "is this process wedged?" — cheap, local, no
dependencies. Readiness is where dependency checks belong.
:::

:::ar
`Running` معناها **العملية قامت**. `Ready` معناها **الـ readiness probe
بتنجح**. والـ Service **بيبعت للـ Ready بس**.

والفرق بينهم هو الفترة اللي البرنامج فيها قام بس لسه مش جاهز: بيقرأ
إعدادات، بيسخّن كاش، بيتصل بالداتابيز.

**وعشان كده الـ readiness probe موجودة أصلاً.** لو تطبيقك مش كاتب readiness
probe، كوبرنيتيس بيعتبره جاهز **في نفس اللحظة** اللي العملية تقوم فيها.
والنتيجة: كل ديبلوي بيبعت ترافيك لبودات لسه بتقوم، وبتشوف موجة ٥٠٢
محدش عارف سببها.

| الـ Probe | لو فشلت | بتستخدمها لإيه |
|:---|:---|:---|
| `readinessProbe` | بتتشال من الـ Service، **ومتموتش** | «أقدر أشتغل دلوقتي؟» |
| `livenessProbe` | الكونتينر **بيتقتل ويرجع** | «أنا معلّق ومفيش أمل؟» |
| `startupProbe` | بتوقّف الاتنين التانيين | تطبيقات بطيئة في القيام |

:::danger أشهر غلطة: نفس الـ endpoint للاتنين
تحط `/health` للاتنين، و `/health` بتشيك على الداتابيز.

النتيجة: أول ما الداتابيز تتعثّر لحظة، **كل البودات بتفشل في الـ liveness،
وكوبرنيتيس بيعمل ريستارت للأسطول كله**.

يعني حوّلت تعثّر مؤقت في dependency لـ **انقطاع كامل**، وزوّدت عليه موجة
إعادة اتصال بتخنق الداتابيز أكتر.

**الصح:** الـ liveness تشيك على «هل العملية دي معلّقة؟» بس — حاجة رخيصة
ومحلية ومن غير أي dependencies. وشيك الـ dependencies في الـ readiness.
:::
:::
:::

## Key takeaways

- **You declare desired state; controllers make reality match.** That is the
  whole model.
- **Deployment → Pods → Service.** You create Deployments, not Pods.
- **Labels connect everything.** `kubectl get endpoints` showing `<none>` means
  a selector typo.
- **`kubectl describe pod`** first, then **`kubectl logs --previous`** for
  crashes.
- **`apply`, never `create`.**
- **Memory limits kill; CPU limits throttle** and make CPU graphs look
  deceptively low.
- Everything is namespaced — `-A` when you cannot find something.
- **`Running` is not `Ready`.** Services route only to `Ready`, and a missing
  readiness probe is why deploys emit unexplained 502s.

:::ar بالمصري · الخلاصة
1. **إنت بتوصف المطلوب، والكنترولرز بتخلي الواقع يطابقه.** دي كل الحكاية.
2. **Deployment ← Pods ← Service.** إنت بتعمل Deployments، **مش** Pods.
3. **الـ labels هي اللي رابطة كل حاجة.** `get endpoints` بتوري `<none>`؟
   يبقى فيه غلطة حرف في الـ selector.
4. **`kubectl describe pod` الأول**، وبعدها `logs --previous` لو بيكراش.
5. **`apply` دايماً، `create` أبداً.**
6. **حد الرام بيقتل، وحد المعالج بيبطّئ** — وبيخلي الجرافات تبان واطية
   وإنت غرقان في الـ latency.
7. **كل حاجة في namespace.** مش لاقي حاجة؟ حط `-A`.
8. **`Running` مش `Ready`.** الـ Service بيبعت للـ Ready بس، ومن غير
   readiness probe كل ديبلوي بيرمي ٥٠٢ ومحدش عارف ليه.
:::
