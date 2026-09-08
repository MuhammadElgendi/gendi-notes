---
title: Kubernetes Pods
slug: kubernetes-pods
type: guide
domain: 03-kubernetes
tags: [kubernetes, pods, containers]
keywords: [sidecar, init container, pause container, localhost, shared volume,
           ephemeral, restart policy, emptydir, pvc, sigterm, network namespace,
           بود, كونتينر, سايدكار]
level: 2
status: stable
prerequisites: [kubernetes-basics, docker]
related: [kubernetes-deployments, kubernetes-troubleshooting,
          devops-interview-questions]
updated: 2026-09-08
---

# Kubernetes Pods

> A pod is not "a container" — it is a small group of containers that share an IP address and a filesystem, and always live and die together.

## What is it?

A pod is the smallest thing Kubernetes can schedule. It wraps **one or more**
containers that:

- share **one IP address** (they reach each other on `localhost`)
- can share **volumes**
- are always placed on the **same node**
- start and stop **together**

Most pods contain exactly one container. The ability to hold more exists for a
specific pattern, not as a way to bundle unrelated services.

:::ar
أول حاجة لازم نصححها: **الـ Pod مش «كونتينر»**، وأغلب الناس فاهمة كده.

الـ Pod هو **أصغر حاجة كوبرنيتيس بيقدر يجدولها**، وهو غلاف حوالين كونتينر
**أو أكتر**، والكونتينرات اللي جواه:

- **بيتشاركوا IP واحد** — يعني بيكلّموا بعض على `localhost`
- **بيقدروا يتشاركوا ملفات** (volumes)
- **بيتحطّوا على نفس النود** دايماً، مستحيل يتفرّقوا
- **بيقوموا ويموتوا مع بعض** — مفيش واحد يعيش والتاني لأ

**بس خد بالك:** أغلب البودات فيها **كونتينر واحد بس**. إمكانية إنك تحط
أكتر من واحد موجودة **لنمط معيّن**، مش عشان تحزم سيرفيسات مالهاش علاقة
ببعض في مكان واحد.

فكّر فيه كده: **الـ Pod زي الشقة، والكونتينرات زي السكان.** ساكنين مع بعض،
بيتشاركوا نفس العنوان ونفس المطبخ، وبيخرجوا مع بعض لو الشقة اتلغت.
:::

## Why it exists

Some helpers only make sense right next to the application — a log shipper
reading the app's files, a proxy handling its network traffic. They need the
same filesystem and the same network as the app.

Rather than complicate the container model, Kubernetes added a wrapper: the pod
is the unit of scheduling, and containers inside it are as close together as two
processes on one machine.

```diagram
   ┌──────────── POD (one IP: 10.1.0.4) ────────────┐
   │                                                │
   │  ┌───────────┐            ┌──────────────┐     │
   │  │  app      │ ←────────→ │  log shipper │     │
   │  │  :8080    │  localhost └──────┬───────┘     │
   │  └─────┬─────┘                   │             │
   │        │      shared volume      │             │
   │        └────────── /logs ────────┘             │
   └────────────────────────────────────────────────┘
```

## What it is made of

| Part | Purpose |
|:---|:---|
| **App container** | Your program. Usually the only one |
| **Init containers** | Run to completion **before** app containers start |
| **Sidecar containers** | Run alongside the app (proxy, log shipper, agent) |
| **Volumes** | Storage shared between the containers in the pod |
| **Pause container** | Hidden. Holds the network namespace open so containers keep one IP |

:::key Why containers in a pod share `localhost`
The pod's network belongs to a hidden "pause" container that starts first and
outlives the others. Every container in the pod joins **its** network namespace.

Two consequences:
- They reach each other on `localhost` — no service discovery needed.
- They **cannot both bind the same port**. Two containers on 8080 in one pod is
  a conflict, exactly as it would be on one machine.
:::

:::ar بالمصري · ليه بيتشاركوا `localhost`؟
فيه كونتينر مخبّي إنت عمرك ما شوفته اسمه **pause container**.

هو بيقوم **الأول**، وبيمسك الـ network namespace (يعني الشبكة بتاعة البود)،
وبيفضل عايش لحد آخر لحظة. وكل الكونتينرات التانية **بتدخل جوه شبكته هو**.

```diagram
   ┌───────── POD ─────────────────────────┐
   │                                       │
   │   pause  ← بيمسك الشبكة والـ IP        │
   │     │                                 │
   │     ├── app         ينضم لشبكة pause  │
   │     └── log-shipper ينضم لشبكة pause  │
   │                                       │
   │   النتيجة: IP واحد، و localhost واحد   │
   └───────────────────────────────────────┘
```

**ونتيجتين مهمين:**

1. **بيكلّموا بعض على `localhost`** وخلاص. مفيش DNS، مفيش Service، مفيش أي
   حاجة. الـ log shipper بيقرأ من `localhost:8080` كأنه على نفس الجهاز.

2. **ممنوع اتنين ياخدوا نفس البورت.** لو كونتينرين في نفس البود عايزين
   ٨٠٨٠، ده **تعارض** — بالظبط زي ما تحاول تشغّل برنامجين على نفس البورت
   على جهاز واحد. واحد منهم هيضرب.

**والغلطة اللي بتحصل:** حد بياخد اتنين microservices شغالين على ٨٠٨٠
وبيحطهم في بود واحد، وبيتفاجئ إن واحد مش بيقوم. مفيش سحر هنا — هم على
نفس الشبكة.
:::

## How to use it

You rarely write a Pod manifest directly — you write a Deployment, and the pod
spec lives inside its `template`. But you need to read it:

```yaml title="A pod spec with an init container and a sidecar"
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  # Run first, to completion, in order. The app does not start until all pass.
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']

  containers:
    - name: app
      image: myapp:1.0
      ports:
        - containerPort: 8080
      volumeMounts:
        - name: logs
          mountPath: /var/log/app

    - name: log-shipper            # sidecar: reads what the app writes
      image: fluent-bit:3.1
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true

  volumes:
    - name: logs
      emptyDir: {}                 # lives and dies with the pod

  restartPolicy: Always
```

### Init containers are the right tool for ordering

An init container must **exit 0** before the next one starts, and all must
finish before app containers begin. Use them for:

- waiting for a dependency to be reachable
- running a database migration
- fetching config or a secret into a shared volume

```sh
kubectl get pods
# NAME   READY   STATUS      RESTARTS   AGE
# web    0/2     Init:0/1    0          10s    ← still in the init container
```

`Init:0/1` means the first of one init container has not finished. If it stays
there, `kubectl logs <pod> -c wait-for-db` tells you what it is waiting for.

:::ar
الـ **init containers** هي الأداة الصح لو محتاج حاجة **تحصل قبل** التطبيق.

القاعدة: كل init container لازم **يخرج بـ ٠** (يعني ينجح) قبل اللي بعده،
وكلهم لازم يخلصوا قبل ما كونتينرات التطبيق تبدأ أصلاً.

```diagram
   الترتيب مضمون ١٠٠٪
   ───────────────────

   init 1  ──خرج بـ 0──→  init 2  ──خرج بـ 0──→  التطبيق يبدأ
      │                       │
      │ خرج بـ 1؟             │ خرج بـ 1؟
      ↓                       ↓
   البود بيعيد المحاولة       البود بيعيد المحاولة
   والتطبيق عمره ما يبدأ      والتطبيق عمره ما يبدأ
```

**بتستخدمها في إيه؟**

- تستنى حاجة تبقى جاهزة (داتابيز مثلاً) قبل ما التطبيق يقوم
- تشغّل database migration
- تنزّل إعدادات أو سيكرت في volume مشترك، والتطبيق يقراه بعدين

**وإزاي تقرأ الحالة؟**

```sh
kubectl get pods
# web    0/2   Init:0/1   0   10s
#              ────┬────
#                  └── لسه في الـ init container الأول من واحد
```

ولو قعد على الحالة دي كتير، شوف هو مستني إيه:

```sh
kubectl logs <pod> -c wait-for-db
```

**نقطة مهمة:** الـ init container اللي بيستنى للأبد بيخلي البود عالق للأبد،
وأول حاجة تشيكها هي إن الحاجة اللي مستنيها **موجودة فعلاً وباسمها الصح**.
:::

### Useful commands

```sh
kubectl get pods -o wide                  # includes pod IP and node
kubectl describe pod <pod>                # events, state, probe results
kubectl logs <pod>                        # single-container pod
kubectl logs <pod> -c app                 # name the container when there are several
kubectl logs <pod> -c app --previous      # the crashed instance
kubectl exec -it <pod> -c app -- sh       # shell inside a specific container
kubectl port-forward pod/<pod> 8080:8080  # reach it from your laptop
```

:::warn With more than one container, `-c` is mandatory
`kubectl logs <pod>` on a multi-container pod errors with "a container name must
be specified". The same applies to `exec`. `kubectl get pod <pod> -o
jsonpath='{.spec.containers[*].name}'` lists the names.
:::

## Pods are disposable — design for it

```diagram
   pod restarts  →  SAME pod, containers restarted, IP KEPT
   pod deleted   →  GONE. A new pod: new name, NEW IP, empty filesystem
```

Three rules follow:

- **Never store data in a container's filesystem.** It is wiped on restart. Use
  a PersistentVolume for anything that must survive.
- **Never rely on a pod's IP.** Use a Service.
- **Handle SIGTERM.** Kubernetes sends it, waits
  `terminationGracePeriodSeconds` (30 by default), then SIGKILLs. An app that
  ignores it loses in-flight requests on every deploy.

:::danger `emptyDir` is not persistent storage
`emptyDir` is often mistaken for a disk. It is created when the pod starts and
**deleted when the pod is removed**. Fine for sharing files between containers
in the same pod; useless for data you care about.

For real storage you need a PersistentVolumeClaim:

```yaml
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: my-data
```
:::

:::ar بالمصري · البودات بتتخلق عشان تموت، صمّم على الأساس ده
فيه فرق لازم تفهمه بين حاجتين الناس بتخلط بينهم:

```diagram
   البود اتعمله restart          البود اتمسح
   ──────────────────────         ───────────────
   نفس البود                      بود جديد خالص
   الكونتينرات قامت من جديد        اسم جديد
   الـ IP زي ما هو                 IP جديد
   الـ emptyDir زي ما هو           فايل سيستم فاضي
```

وعلى الأساس ده، **تلات قواعد**:

**١. متخزّنش داتا في فايل سيستم الكونتينر.** بتتمسح مع كل restart. أي حاجة
لازم تعيش، حطها في PersistentVolume.

**٢. متعتمدش على IP البود.** استخدم Service. الـ IP بيتغير مع كل بود جديد.

**٣. اتعامل مع `SIGTERM`.** كوبرنيتيس بيبعتها، بيستنى ٣٠ ثانية
(`terminationGracePeriodSeconds`)، وبعدين `SIGKILL`. والتطبيق اللي بيتجاهلها
**بيخسر الريكوستات اللي في إيده مع كل ديبلوي**.

:::danger و `emptyDir` **مش** ستوريدج
دي غلطة بتحصل كتير: حد بيشوف كلمة "volume" وبيفتكر إن الداتا محفوظة.

الـ `emptyDir` بيتعمل لما البود يقوم، و**بيتمسح لما البود يتشال**. خلاص.

| | `emptyDir` | PersistentVolumeClaim |
|:---|:---|:---|
| بيعيش قد إيه | عمر البود | أطول من البود |
| بينفع لإيه | مشاركة ملفات بين كونتينرات نفس البود | داتا بتهمك |
| البود اتمسح | **الداتا ضاعت** | الداتا موجودة |

فهو ممتاز عشان الـ app يكتب لوج والـ sidecar يقراه. **وصفر فايدة** لداتابيز.

```yaml
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: my-data     # ← دي اللي بتعيش
```
:::
:::

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| Stuck at `Init:0/1` | Init container waiting or failing | `kubectl logs <pod> -c <init-name>` |
| `0/2 READY` but Running | One container's readiness probe failing | `kubectl describe pod` |
| One container restarts, others do not | Only that container is failing | `kubectl logs <pod> -c <name> --previous` |
| "container name must be specified" | Multi-container pod | Add `-c <name>` |
| Both containers want port 8080 | They share one network namespace | Change one of them |
| Data gone after restart | `emptyDir` or the container filesystem | Use a PVC |

## When a second container is justified

| Pattern | Example | Is it right? |
|:---|:---|:---|
| **Sidecar** | Log shipper, service-mesh proxy | Yes — needs the same net/fs |
| **Init** | Wait for a dependency, run a migration | Yes |
| **Adapter** | Reformat the app's metrics for a scraper | Yes |
| Two unrelated services | An API and a worker | **No** — separate Deployments |

The test: **would you ever want to scale them separately?** If yes, they belong
in different pods. A pod scales as one unit; bundling an API with a worker means
you can never have 10 of one and 2 of the other.

:::ar
إمتى يبقى الكونتينر التاني مبرّر فعلاً؟

| النمط | مثال | صح؟ |
|:---|:---|:---|
| **Sidecar** | log shipper، بروكسي service mesh | ✔ محتاج نفس الشبكة/الملفات |
| **Init** | يستنى dependency، يشغّل migration | ✔ |
| **Adapter** | يحوّل مقاييس التطبيق لشكل تاني | ✔ |
| سيرفيسين مالهمش علاقة | API و worker | ✘ **Deployments منفصلة** |

**والاختبار اللي يحسم الموضوع في ثانية:**

> **هل ممكن في أي وقت تحب تعمل scale لواحد منهم لوحده؟**

لو الإجابة **أيوه**، يبقى هما في بودات مختلفة. خلاص، مفيش نقاش.

عشان **الـ Pod بيعمل scale كوحدة واحدة**. فلو حزمت API مع worker في بود
واحد، إنت **حرمت نفسك للأبد** إنك يكون عندك ١٠ من الـ API و ٢ من الـ worker.
هتبقى مجبور تعمل ١٠ من الاتنين، وتدفع في worker مش محتاجه.

**والقاعدة العامة:** الكونتينر التاني ينفع بس لو **مضطر** يتشارك شبكة البود
أو ملفاته. لو مش مضطر، فصله.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Why does Kubernetes have Pods at all? Why not just schedule containers?
Because some helpers are useless unless they are *inside* the application's
network and filesystem, and the container model has no way to express "these
two are one unit".

A log shipper must read the app's files. A service-mesh proxy must intercept
the app's traffic on `localhost` and must own the same IP so the network sees
one address. Both need co-location guaranteed, not likely.

Kubernetes could have added "affinity" rules to containers, but that only
makes it *probable* they land together. The Pod makes it **atomic**: one
scheduling unit, one IP, one lifecycle, one node — guaranteed.

:::key The follow-up
"So why not put the whole application in one Pod?" Because the Pod is also
the **unit of scaling**, and that is the tension. Everything in a Pod scales
together and dies together. So the design rule falls out of the mechanism:
put things in one Pod only when they must share the network or filesystem,
and never when you might want to scale them independently.
:::

:::ar
عشان فيه مساعِدين **بلا فايدة** إلا لو كانوا **جوه** شبكة التطبيق وملفاته،
وموديل الكونتينر لوحده **مفيهوش طريقة تقول «الاتنين دول وحدة واحدة»**.

الـ log shipper لازم يقرا ملفات التطبيق. وبروكسي الـ service mesh لازم
يعترض ترافيك التطبيق على `localhost`، ولازم يمسك **نفس الـ IP** عشان
الشبكة تشوف عنوان واحد.

والاتنين محتاجين إنهم يكونوا مع بعض **مضمون**، مش **محتمل**.

كوبرنيتيس كان يقدر يضيف قواعد affinity للكونتينرات، بس دي بتخليها
**مرجّحة** إنهم يقعدوا مع بعض، مش مضمونة. الـ **Pod** بيخليها **ذرّية**:
وحدة جدولة واحدة، IP واحد، دورة حياة واحدة، نود واحدة — **مضمون**.

**والسؤال اللي بيجي بعده:** «أمال ما نحط التطبيق كله في Pod واحد؟»

عشان الـ Pod كمان هو **وحدة الـ scaling**. وهنا التوتر: كل حاجة في الـ Pod
بتعمل scale مع بعض وبتموت مع بعض.

فالقاعدة بتطلع من الميكانيزم نفسه: **حط حاجات في Pod واحد بس لما تكون
مضطرة تتشارك الشبكة أو الملفات، وعمرك ما تحطهم لو ممكن تحب تعمل scale
لواحد منهم لوحده.**
:::
:::

:::q An init container waits for the database and the Pod is stuck at `Init:0/1` forever. Walk me through it.
```sh
# 1. What is it actually saying?
kubectl logs <pod> -c wait-for-db

# 2. Is the thing it waits for even there?
kubectl get svc db
kubectl get endpoints db        # <none> means the Service has no backends

# 3. Can anything reach it from this namespace?
kubectl run t --rm -it --image=busybox --restart=Never -- nc -zv db 5432
```

The three causes, in the order they actually occur:

| Cause | Tell |
|:---|:---|
| The Service name or port is wrong | `kubectl get svc` — no such Service, or a different port |
| The Service exists but has no Ready pods | `kubectl get endpoints db` shows `<none>` |
| A NetworkPolicy blocks egress from this namespace | Works from one namespace, not another |

:::warn The design question hiding in this one
An interviewer may follow with: "is waiting for the database in an init
container even the right design?" Often **no**. It makes the app unable to
start at all during a brief database blip, and it does not help once the app
is running — the database can still go away a second later.

The more robust pattern is an app that retries its connection with backoff
and reports itself not-ready via a readiness probe until it succeeds. The
init container turns a transient dependency failure into a hard startup
failure.
:::

:::ar
امشي على التلات خطوات دي بالترتيب:

**١.** `kubectl logs <pod> -c wait-for-db` — هو بيقول إيه أصلاً؟
**٢.** `kubectl get endpoints db` — الحاجة اللي مستنيها موجودة ولا `<none>`؟
**٣.** جرّب توصلها من بود تاني: `nc -zv db 5432`

والتلات أسباب بترتيب حدوثهم:

| السبب | تعرفه إزاي |
|:---|:---|
| اسم الـ Service أو البورت غلط | `kubectl get svc` — مفيش، أو بورت تاني |
| الـ Service موجودة بس مفيش بودات Ready وراها | `get endpoints` = `<none>` |
| NetworkPolicy مانعة الخروج من الـ namespace دي | بتنفع من namespace وتفشل من تانية |

**وفيه سؤال تصميم مخبّي في السؤال ده**، ساعات بيسألوه بعده:

> «وهل إنك تستنى الداتابيز في init container ده أصلاً تصميم صح؟»

**وغالباً لأ.** عشان ده بيخلي التطبيق **مش قادر يقوم خالص** لو الداتابيز
تعثّرت لحظة، وكمان **مش بينفع** بعد ما التطبيق يقوم — الداتابيز تقدر تروح
بعد ثانية وإنت معملتش حاجة.

**النمط الأقوى:** التطبيق يعيد المحاولة بـ backoff، ويقول عن نفسه إنه
مش `Ready` (من خلال readiness probe) لحد ما ينجح.

الـ init container بيحوّل **فشل مؤقت في dependency** لـ **فشل نهائي في
الإقلاع**. وده مقايضة غالباً مش في مصلحتك.
:::
:::

## Key takeaways

- A pod is **one or more containers sharing an IP and volumes**, always on one
  node.
- They talk over **`localhost`** and cannot reuse the same port.
- **Init containers run to completion first** — the right tool for ordering.
- Pods are **disposable**: new pod means new IP and empty filesystem.
- **`emptyDir` dies with the pod.** Use a PVC for real data.
- With multiple containers, `logs` and `exec` need **`-c <name>`**.
- Second container only if it must share the pod's network or filesystem.

:::ar بالمصري · الخلاصة
1. **الـ Pod كونتينر أو أكتر بيتشاركوا IP وملفات**، وعلى نود واحدة دايماً.
2. **بيكلّموا بعض على `localhost`**، ومش ينفع اتنين ياخدوا نفس البورت.
3. **الـ init containers بتخلص الأول** — دي الأداة الصح لو محتاج ترتيب.
4. **البودات بتتخلق عشان تموت**: بود جديد = IP جديد وفايل سيستم فاضي.
5. **الـ `emptyDir` بيموت مع البود.** للداتا الحقيقية استخدم PVC.
6. **مع أكتر من كونتينر، الـ `logs` والـ `exec` محتاجين `-c <name>`.**
7. **كونتينر تاني بس لو مضطر** يتشارك شبكة البود أو ملفاته. والاختبار:
   لو ممكن تحب تعمل scale لواحد لوحده، يبقى فصلهم.
:::
