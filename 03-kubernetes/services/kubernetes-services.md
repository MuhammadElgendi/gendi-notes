---
title: Kubernetes Services
slug: kubernetes-services
type: guide
domain: 03-kubernetes
tags: [kubernetes, services, networking]
keywords: [clusterip, nodeport, loadbalancer, ingress, endpoints, selector,
           dns, port, targetport, endpointslice, kube-proxy, keepalive, grpc,
           سيرفيس, شبكة, بورت, عنوان]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-deployments, dns, kubernetes-troubleshooting,
          devops-interview-questions]
updated: 2026-09-08
---

# Kubernetes Services

> Pods get a new IP address every time they restart, so nothing can talk to them directly. A Service is the stable address that stays put.

## What is it?

A Service gives a group of pods one **fixed IP address and DNS name**. Clients
talk to the Service; it forwards to whichever pods are currently healthy.

```diagram
   without a Service              with a Service
   ─────────────────              ──────────────
   client → 10.1.0.4  ✗ gone      client → web (10.96.0.10)
          → 10.1.0.9  ✗ gone                    │
          → 10.1.2.3  ✓ for now                 ├→ 10.1.0.4
                                                ├→ 10.1.0.5
   who tracks the current list?                 └→ 10.1.2.6
   every client, forever.             Kubernetes tracks it. Once.
```

:::ar
تعال نبدأ بالمشكلة الأصلية، عشان لو فهمتها الحل هيبان بديهي.

**البود مش عنده عنوان ثابت.** كل مرة يقوم من جديد — يكراش، يتنقل لنود
تانية، يتعمل ديبلوي — بياخد **IP جديد خالص**.

فلو كتبت في تطبيقك `connect to 10.1.0.4`، الكود بتاعك هيشتغل النهاردة
وهيضرب بكرة. مش «ممكن يضرب» — **هيضرب**، عشان ده تصميم كوبرنيتيس نفسه.

**والـ Service هي الحل:** عنوان **واحد ثابت** لمجموعة بودات. إنت بتكلّم
العنوان الثابت، وهو بيوصّلك لأي بود سليم موجود في اللحظة دي.

فكّر فيها كده: **البودات موبايلات بتتغير أرقامها، والـ Service هي رقم
الأرضي بتاع البيت.** إنت بتتصل على الأرضي، ومش مهتم مين اللي هيرد.

| من غير Service | مع Service |
|:---|:---|
| كل عميل لازم يعرف كل الـ IPs | العميل يعرف اسم واحد بس |
| الـ IPs بتتغير، فلازم حد يتابع | كوبرنيتيس بيتابع، **مرة واحدة** |
| بود مات؟ العميل بيضرب | بود مات؟ الترافيك بيروح لغيره |
:::

## Why it exists

Pod IPs are **ephemeral by design**. A pod that restarts, moves node, or scales
gets a different address. Hard-coding one guarantees breakage.

A Service solves two problems at once: a stable address, and load balancing
across whatever pods exist right now.

## What it is made of

Two things happen behind one object — and nearly all Service bugs are in the
first while people debug the second:

```diagram
   ① the ENDPOINT list          ② the ROUTING rules
   ─────────────────────        ───────────────────
   "which pods match my         "rewrite traffic for
    selector AND pass           10.96.0.10 to one of
    their readiness probe?"      those pod IPs"

   maintained by the            programmed into each node's
   endpoints controller         kernel by kube-proxy
```

### The four types

| Type | Gives you | Reachable from | Use when |
|:---|:---|:---|:---|
| **ClusterIP** (default) | Internal IP + DNS name | Inside the cluster only | Service-to-service. Most of the time |
| **NodePort** | A port on every node | Outside, if you can reach nodes | Rarely direct — it is a building block |
| **LoadBalancer** | A cloud load balancer | The internet | Cloud-managed external entry |
| **ExternalName** | A DNS CNAME, no proxying | Inside | Aliasing an external hostname |

:::note LoadBalancer is a superset, not an alternative
A `LoadBalancer` Service creates a `NodePort`, which creates a `ClusterIP`. All
three exist at once. This is why external traffic still goes through the same
in-cluster routing rules, and why the cloud LB's health checks matter.
:::

:::ar الـ Service حاجتين مخبّيين جوه أوبجكت واحد
دي أهم فكرة في الصفحة، وهي سبب إن أغلب الناس بتظبّط الحاجة الغلط.

الـ Service مش حاجة واحدة، هي **حاجتين** شغالين مع بعض:

```diagram
   ① لستة الـ ENDPOINTS              ② قواعد التوجيه (ROUTING)
   ────────────────────               ─────────────────────────
   "أنهي بودات مطابقة للـ            "أي ترافيك جاي على
    selector بتاعي  و  كمان          10.96.0.10، حوّله لواحد
    ناجحة في الـ readiness؟"          من الـ IPs اللي في اللستة"

   بيحافظ عليها                       بيكتبها kube-proxy جوه
   الـ endpoints controller           كيرنل كل نود

   ← ٩٠٪ من المشاكل هنا               ← والناس بتقعد تدوّر هنا
```

**اللستة الأول، وبعدين القواعد.** لو اللستة فاضية، القواعد مش هتنفع بحاجة.

وعشان كده أول أمر تكتبه دايماً هو `kubectl get endpoints` — إنت بتشيك على
الحاجة رقم ① قبل ما تدوّر في ②.

**والأنواع الأربعة:**

| النوع | بيديك إيه | توصله منين | تستخدمه امتى |
|:---|:---|:---|:---|
| **ClusterIP** (الافتراضي) | عنوان داخلي + اسم DNS | من جوه الكلاستر بس | سيرفيس بيكلّم سيرفيس. **أغلب الوقت** |
| **NodePort** | بورت على كل نود | من بره، لو توصل للنودات | نادراً لوحده، ده بلوك بناء |
| **LoadBalancer** | لود بالانسر من الكلاود | من الإنترنت | مدخل خارجي على الكلاود |
| **ExternalName** | مجرد CNAME، مفيش توجيه | من جوه | تسمّي حاجة بره باسم داخلي |

:::note و `LoadBalancer` مش بديل، ده **مجموع**
حاجة الناس بتلخبط فيها: `LoadBalancer` بيعمل `NodePort`، والـ `NodePort`
بيعمل `ClusterIP`. **التلاتة موجودين مع بعض في نفس الوقت.**

وعشان كده الترافيك الجاي من بره **لسه بيمر على نفس قواعد التوجيه الداخلية**،
وعشان كده الـ health checks بتاعة الـ LB بتفرق فعلاً.
:::
:::

## How to use it

```yaml title="service.yaml"
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web          # MUST match the pods' labels exactly
  ports:
    - port: 80        # the port the Service listens on
      targetPort: 8080  # the port the CONTAINER listens on
```

:::warn `port` vs `targetPort` — swapped constantly
- **`port`** is what clients connect to on the Service.
- **`targetPort`** is the port inside the container.

They are often the same, which is why the distinction is easy to miss — and then
one day they differ and you get "connection refused" from a perfectly healthy
pod.
:::

:::ar
الرقمين دول بيتعكسوا على طول، فخد بالك:

```diagram
   العميل                Service              Container
   ──────                ───────              ─────────
     │                                            │
     │   بيتصل على        port: 80                │
     └──────────────────→ ┌───────┐               │
                          │  svc  │  targetPort:  │
                          │       │  8080         │
                          └───────┘ ─────────────→ │
                                                   │
   port       = البورت اللي الـ Service سامعة عليه (اللي العميل بيكلّمه)
   targetPort = البورت اللي الكونتينر نفسه سامع عليه
```

- **`port`** = دخول الـ Service. ده اللي العميل بيتصل عليه.
- **`targetPort`** = دخول الكونتينر. ده اللي التطبيق فعلاً سامع عليه.

**وسبب إنها بتلخبط:** إنهم في ٩٠٪ من الحالات **بيبقوا نفس الرقم**، فمحدش
بياخد باله من الفرق. وبعدين يوم يجي يكونوا مختلفين، وتشوف
`connection refused` من بود سليم ١٠٠٪ ومش فاهم إيه اللي بيحصل.

**إزاي تتأكد؟** بصّ على البورت الحقيقي بتاع الكونتينر:

```sh
kubectl get pod <name> -o jsonpath='{.spec.containers[*].ports[*].containerPort}{"\n"}'
```

ولازم يطابق الـ `targetPort` بتاع الـ Service.
:::

### DNS names

Once a Service exists, it has a name:

```diagram
   web  .  production  .  svc  .  cluster.local
    │          │           │          │
    │          │           │          └─ cluster domain
    │          │           └─ "svc" for Services
    │          └─ namespace
    └─ Service name
```

| From | You can write |
|:---|:---|
| Same namespace | `web` |
| Another namespace | `web.production` |
| Anywhere (fully qualified) | `web.production.svc.cluster.local` |

So an app connects to `postgres://db:5432` where `db` is just the Service name.
You never handle IP addresses.

:::ar
اسم الـ Service بيتحول لاسم DNS تلقائياً، والاسم مبني من ٤ حاجات:

```diagram
   web  .  production  .  svc  .  cluster.local
    │          │           │          │
    │          │           │          └─ دومين الكلاستر
    │          │           └─ "svc" يعني ده Service
    │          └─ الـ namespace
    └─ اسم الـ Service
```

وإنت مش لازم تكتب الاسم الطويل ده كله:

| إنت فين | تكتب إيه |
|:---|:---|
| نفس الـ namespace | `web` |
| namespace تانية | `web.production` |
| في أي مكان (الاسم الكامل) | `web.production.svc.cluster.local` |

يعني تطبيقك بيتصل على `postgres://db:5432` وخلاص، و `db` هو اسم الـ Service.
**إنت عمرك ما بتلمس IP.**

:::warn الاسم القصير بيوفّر كتابة بس بيكلّفك DNS
لما تكتب `db` بس، الـ resolver بيجرّب يوسّعها على كل الـ search domains
واحدة واحدة: `db.production.svc.cluster.local`، وبعدها
`db.svc.cluster.local`، وبعدها `db.cluster.local`... لحد ما يلاقي.

وده معناه **٤ أو ٥ استعلامات DNS** بدل واحد لكل اتصال. على تطبيق بيفتح
كونيكشنز كتير، دي بتبقى مشكلة أداء حقيقية وبتحمّل على الـ CoreDNS.

**الحل:** اكتب الاسم الكامل (بنقطة في الآخر كمان: `db.production.svc.cluster.local.`)
في إعدادات التطبيقات اللي بتفتح كونيكشنز كتير، أو ظبّط `ndots` في الـ Pod spec.
:::
:::

### Commands

```sh
kubectl get svc                      # all Services with their ClusterIPs
kubectl get endpoints web            # THE FIRST DEBUGGING COMMAND
kubectl describe svc web

# Test from inside the cluster — a Service is not reachable from your laptop
kubectl run tmp --rm -it --image=busybox --restart=Never -- sh
#   inside: wget -qO- http://web
#   inside: nslookup web

# Or reach it from your machine temporarily
kubectl port-forward svc/web 8080:80    # then open http://localhost:8080
```

`kubectl port-forward` is how you test an internal Service from your laptop
without exposing it to the internet.

## What goes wrong

:::danger `ENDPOINTS: <none>` — the most common Kubernetes bug by a wide margin
The Service exists, DNS resolves, connections are accepted — and everything
times out. Because the Service has **no backends**.

```sh
kubectl get endpoints web
# web    <none>    5m      ← this
```

Two possible causes:

**1. The selector does not match the pods' labels.** Compare them character by
character:

```sh
kubectl get svc web -o jsonpath='{.spec.selector}{"\n"}'
kubectl get pods --show-labels
```

**2. The pods are not Ready.** Only pods passing their readiness probe are
listed. `kubectl get pods` showing `0/1 READY` means the probe is failing — the
Service is behaving correctly by refusing to send traffic there.

There is no error message for either. Always check endpoints first.
:::

:::ar `<none>` دي أشهر مشكلة في كوبرنيتيس كله
الـ Service موجودة، والـ DNS بيترجم، والكونيكشن بيتقبل... وكل حاجة بتقعد
تستنى لحد ما الوقت يخلص. **عشان مفيش أي بود ورا الـ Service.**

```sh
kubectl get endpoints web
# web    <none>    5m      ← دي هي
```

وفيه **سببين بس** ممكن يعملوا كده. اتأكد منهم بالترتيب:

**١. الـ selector مش مطابق للـ labels.** قارنهم حرف بحرف:

```sh
kubectl get svc web -o jsonpath='{.spec.selector}{"\n"}'
kubectl get pods --show-labels
```

خد بالك من حروف كبيرة وصغيرة، ومن `app` مقابل `App`، ومن مسافة زايدة.

**٢. البودات مش `Ready`.** الـ endpoints بتحتوي على البودات الناجحة في
الـ readiness probe **بس**.

فلو `kubectl get pods` بيوريك `0/1 READY`، يبقى الـ probe بتفشل — و
**الـ Service بتتصرف صح تماماً** لما بترفض تبعتلها ترافيك. المشكلة مش في
الـ Service، المشكلة في التطبيق أو في الـ probe.

**والحاجة القاسية:** مفيش أي رسالة إيرور لا في الحالة الأولى ولا التانية.
فاشيك على الـ endpoints **قبل أي حاجة**، دايماً.
:::

| Symptom | Cause | Fix |
|:---|:---|:---|
| `ENDPOINTS: <none>` | Selector mismatch, or pods not Ready | See above |
| Connection refused | `targetPort` wrong | Compare to the container's real port |
| `ping <ClusterIP>` fails | A ClusterIP is not pingable — it is a routing rule, not a host | Use `wget`/`curl`, not `ping` |
| Works from one pod, not another | NetworkPolicy blocking it | `kubectl get networkpolicy -A` |
| `LoadBalancer` stuck on `<pending>` | No cloud integration (e.g. plain minikube) | Use `port-forward` or NodePort locally |
| Scaled up, load still uneven | Keep-alive connections pinned to old pods | See below |

:::warn Scaling up did not spread the load
Kubernetes balances **connections**, not requests. With HTTP keep-alive or gRPC,
one long-lived connection stays pinned to one pod for its whole life.

So scaling from 3 to 30 pods moves **no existing traffic**. The 27 new pods are
Ready, in the endpoint list, and idle.

The tell: per-pod request rates are wildly uneven while the Service looks
perfectly healthy. Fixes are a maximum connection lifetime on the client, or an
L7 proxy / service mesh that balances per request.
:::

:::ar عمّلت scale ومفيش حاجة اتغيرت
دي مشكلة بتحصل في البرودكشن كتير، والناس تقعد ساعات مش فاهمة.

**كوبرنيتيس بيوزّع الـ connections، مش الـ requests.**

والفرق ده بيبقى كارثة مع HTTP keep-alive و gRPC، عشان دول بيفتحوا **كونيكشن
واحد ويقعدوا يستخدموه** لآلاف الريكوستات.

```diagram
   الكونيكشن بيتوزّع مرة واحدة، أول ما يتفتح
   ──────────────────────────────────────────

   العميل ──── كونيكشن واحد ────→ Pod 1     ← ١٠٠٠ ريكوست/ث
                                   Pod 2     ← صفر
                                   Pod 3     ← صفر

   عمّلت scale من ٣ لـ ٣٠؟

   العميل ──── نفس الكونيكشن ───→ Pod 1     ← لسه ١٠٠٠ ريكوست/ث
                                   Pod 2..30 ← كلهم Ready، وكلهم فاضيين
```

يعني إنت زوّدت ٢٧ بود، وكلهم `Ready`، وكلهم في لستة الـ endpoints،
**ومفيش ولا ريكوست واحد رايحلهم**. عشان الترافيك الموجود ماشي على كونيكشنز
اتفتحت خلاص واترابطت ببودات قديمة.

**إزاي تعرف إن دي هي المشكلة؟** بصّ على معدّل الريكوستات **لكل بود لوحده**.
هتلاقيه متفاوت بشكل جنوني، والـ Service شكلها سليم تماماً.

**والحلول:**

1. حدّد **عمر أقصى للكونيكشن** عند العميل، عشان يقطع ويفتح من جديد ويعاد
   توزيعه. (أسهل حل وأسرع.)
2. حط **L7 proxy** أو service mesh (Envoy، Linkerd) — دي بتوزّع
   **لكل ريكوست** مش لكل كونيكشن.
3. لو gRPC، استخدم client-side load balancing مع headless Service.
:::

## Getting traffic in from outside

A `ClusterIP` Service is internal. For HTTP from the internet you normally want
an **Ingress** in front of it — one load balancer for many services, with
hostname and path routing and TLS.

```diagram
   internet
      │
      ↓
   Ingress          example.com/api  → api Service
      │             example.com/     → web Service
      ├──→ Service (api) ──→ pods
      └──→ Service (web) ──→ pods
```

```yaml title="ingress.yaml"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site
spec:
  ingressClassName: nginx      # which controller handles this
  rules:
    - host: example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port: { number: 80 }
```

An Ingress object does nothing on its own — a **controller** (ingress-nginx,
Traefik) must be installed in the cluster to act on it. An Ingress that appears
to be ignored usually means no controller, or the wrong `ingressClassName`.

:::ar
الـ `ClusterIP` جوّاني، يعني الإنترنت مش شايفه. فعشان تجيب ترافيك من بره
على HTTP، إنت محتاج **Ingress**.

**وليه Ingress مش LoadBalancer لكل سيرفيس؟** عشان الفلوس والتحكّم:

| لكل سيرفيس LoadBalancer | Ingress واحد |
|:---|:---|
| ١٠ سيرفيسات = ١٠ لود بالانسر = ١٠ فواتير | لود بالانسر واحد |
| ١٠ شهادات TLS تظبّطها بإيدك | الشهادات في مكان واحد |
| مفيش توجيه بالمسار | `/api` لسيرفيس و `/` لسيرفيس تاني |

:::danger الـ Ingress object لوحده **مش بيعمل أي حاجة**
دي أشهر لخبطة مع الـ Ingress. إنت بتعمل `kubectl apply` للـ Ingress،
والأمر بينجح، ومفيش أي حاجة بتحصل. **وكأنه بيتجاهلك.**

السبب إن الـ Ingress **مجرد ورقة مكتوب فيها قواعد**. لازم يكون فيه
**controller** منصّب في الكلاستر (ingress-nginx أو Traefik) هو اللي يقرأ
الورقة دي وينفّذها.

اتأكد من حاجتين:

```sh
# ١. فيه controller أصلاً؟
kubectl get pods -A | grep -i ingress

# ٢. الـ ingressClassName صح؟
kubectl get ingressclass
```

لو الـ `ingressClassName` مكتوب `nginx` والمنصّب اسمه `traefik`، الـ Ingress
هيتجاهل تماماً ومن غير أي شكوى.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q How does a Service actually route traffic? Is it a proxy? · الـ Service بروكسي؟
**No, and this is the answer that shows you understand the data path.**

A ClusterIP is a **virtual IP that no process listens on**. There is no
Service pod, no Service container, nothing to SSH into. What exists is a set
of packet-rewriting rules in every node's kernel.

```diagram
   Pod sends a packet to 10.96.0.10:80  (the ClusterIP)
        │
        ↓
   node kernel: iptables / IPVS / eBPF rules, written by kube-proxy
        │  DNAT — rewrite the destination to a real pod IP
        ↓
   10.1.0.5:8080   ← one of the Ready endpoints, picked here
        │
        ↓
   conntrack records the choice, so every later packet of the
   same connection goes to the SAME pod
```

Three things this explains immediately:

- **You cannot `ping` a ClusterIP.** There is no host there to reply. A
  failing ping proves nothing at all.
- **Load balancing is per connection**, because the pod is chosen once at
  DNAT time and conntrack pins it.
- **kube-proxy is not in the request path.** It only *writes* the rules. Kill
  kube-proxy and existing traffic keeps flowing; only new Services stop
  being programmed.

:::ar
**لأ، ومش بروكسي خالص** — والإجابة دي هي اللي تبيّن إنك فاهم مسار الداتا.

الـ ClusterIP **عنوان وهمي مفيش أي برنامج سامع عليه**. مفيش بود اسمه
Service، ومفيش كونتينر تدخله. اللي موجود فعلاً هو **قواعد بتعدّل
البكتات** مكتوبة في كيرنل كل نود.

بص على الرسمة: البود بيبعت بكت على `10.96.0.10`، وكيرنل النود بيعدّل
عنوان الوصول (DNAT) لـ IP بود حقيقي، والـ conntrack بيسجّل الاختيار ده
عشان باقي بكتات نفس الكونيكشن تروح **لنفس البود**.

**وتلات حاجات بتتفسّر فوراً كده:**

1. **مش تقدر تعمل `ping` لـ ClusterIP.** مفيش حاجة هناك ترد عليك.
   فلو الـ ping فشل، ده **مش دليل على أي حاجة**. استخدم `curl` أو `wget`.
2. **التوزيع لكل كونيكشن**، عشان البود بيتختار مرة واحدة وقت الـ DNAT
   والـ conntrack بيثبّته.
3. **الـ kube-proxy مش في طريق الريكوست.** هو بس بيكتب القواعد. اقتله،
   والترافيك الموجود يفضل ماشي — اللي بيقف بس هو إن السيرفيسات الجديدة
   مبقتش بتتكتب.
:::
:::

:::q A rolling deploy causes a burst of 502s every time, even though the new pods are healthy. Why?
Almost always the **de-registration race**: the pod stops accepting traffic
after it has already been sent some.

When a pod is deleted, two things happen **in parallel, not in order**:

```diagram
   pod deleted
        │
        ├──→ kubelet sends SIGTERM to the container    ← starts dying NOW
        │
        └──→ endpoints controller removes it from the
             EndpointSlice, then EVERY node must
             reprogram its rules                       ← takes 100ms-2s

   In that gap the pod is shutting down but nodes still
   route to it. Those requests become 502s.
```

**The fix is a `preStop` hook that just sleeps:**

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]
```

That looks absurd and is correct. It delays `SIGTERM` long enough for the
endpoint removal to propagate everywhere, so the pod keeps serving during
the window when nodes might still route to it. Combine with an application
that handles `SIGTERM` by draining rather than exiting immediately.

:::key
The insight being tested is that **Kubernetes is eventually consistent**.
Nothing is transactional; "removed from the Service" and "told to shut down"
are two independent reconciliation loops with no ordering guarantee between
them. Most real Kubernetes bugs are races like this one.
:::

:::ar
السبب في ٩٥٪ من الحالات هو **سباق إلغاء التسجيل**: البود بيبطّل يستقبل
ترافيك **بعد** ما يكون استقبل بعضه خلاص.

لما بود يتمسح، حاجتين بيحصلوا **بالتوازي، مش بالترتيب**:

1. الـ kubelet بيبعت `SIGTERM` للكونتينر — **بيبدأ يموت حالاً**.
2. الـ endpoints controller بيشيله من الـ EndpointSlice، وبعدها **كل نود**
   لازم تعيد كتابة قواعدها — **وده بياخد من ١٠٠ مللي لـ ثانيتين**.

وفي الفتحة دي، البود بيقفل والنودات لسه بتبعتله. **والريكوستات دي بتبقى ٥٠٢.**

**والحل هو `preStop` hook بينوّم بس:**

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]
```

شكلها سخيف، وهي **صح**. هي بتأخّر الـ `SIGTERM` مدة كفاية لحد ما خبر
الشيل يوصل لكل النودات، فالبود يفضل بيخدم في الفترة اللي ممكن حد لسه
يبعتله فيها.

وطبعاً مع تطبيق بيتعامل مع `SIGTERM` بإنه **يصرّف** اللي عنده، مش يقفل فوراً.

**والفكرة اللي بيتقاس عليها:** إن **كوبرنيتيس eventually consistent**.
مفيش أي حاجة transactional. «اتشال من الـ Service» و «اتقاله اقفل» دول
حلقتين تحكّم مستقلين تماماً، **ومفيش أي ضمان لترتيبهم**.

وأغلب مشاكل كوبرنيتيس الحقيقية هي سباقات زي دي بالظبط.
:::
:::

:::q When would you use a headless Service, and what does it change?
Set `clusterIP: None` and you get a Service with **no virtual IP and no
routing rules**. DNS then returns the pod IPs directly — one A record per
Ready pod — instead of a single ClusterIP.

| | Normal ClusterIP | Headless (`clusterIP: None`) |
|:---|:---|:---|
| DNS returns | one virtual IP | every Ready pod's IP |
| Load balancing | kernel, per connection | the **client** decides |
| Individual pods addressable | no | yes, via StatefulSet DNS names |

Use it when the client needs to know about individual pods:

- **StatefulSets** — a database replica set where you must reach `db-0`
  specifically, because it is the primary.
- **gRPC client-side load balancing** — the client gets all the addresses and
  balances per RPC, which fixes the keep-alive pinning problem properly.
- **Peer discovery** — clustered software (Cassandra, Kafka, Elasticsearch)
  where members find each other.

:::ar
لما تكتب `clusterIP: None`، بتاخد Service **من غير عنوان وهمي ومن غير أي
قواعد توجيه**. والـ DNS بيرجّعلك **IPs البودات نفسها** — ريكورد لكل بود
Ready — بدل عنوان واحد.

| | ClusterIP عادي | Headless |
|:---|:---|:---|
| الـ DNS بيرجّع | عنوان وهمي واحد | كل IPs البودات الجاهزة |
| التوزيع | الكيرنل، لكل كونيكشن | **العميل** هو اللي بيقرر |
| توصل لبود معيّن | لأ | أيوه، بأسماء الـ StatefulSet |

**تستخدمها لما العميل يحتاج يعرف البودات فرادى:**

- **StatefulSets** — داتابيز فيها replicas، ولازم توصل لـ `db-0` بالتحديد
  عشان هو الـ primary.
- **gRPC** — العميل بياخد كل العناوين ويوزّع لكل RPC، وده بيحل مشكلة
  الـ keep-alive اللي فوق **حل صح** مش ترقيع.
- **اكتشاف الأعضاء** — برامج زي كافكا وكاسندرا، اللي محتاجة الأعضاء يلاقوا
  بعضهم.
:::
:::

## Key takeaways

- Pod IPs change; a Service is the **stable address**.
- **`kubectl get endpoints <svc>` first, always.** `<none>` means selector
  mismatch or pods not Ready.
- **`port`** is the Service's, **`targetPort`** is the container's.
- A ClusterIP is **not pingable** — that failing proves nothing.
- Services are reachable **from inside the cluster**; use `port-forward` from
  your laptop.
- Load balancing is **per connection**. Keep-alive defeats it.
- **Ingress** for HTTP from outside — and it needs a controller installed.

:::ar الخلاصة
1. **الـ IPs بتتغير، والـ Service هي العنوان الثابت.**
2. **`kubectl get endpoints <svc>` الأول، دايماً.** `<none>` معناها إما
   الـ selector غلط، وإما البودات مش `Ready`.
3. **`port` بتاعة الـ Service، و `targetPort` بتاعة الكونتينر.**
4. **الـ ClusterIP مش بيرد على `ping`** — ده عنوان وهمي مفيش حاجة سامعة
   عليه. فالـ ping اللي بيفشل **مش دليل على حاجة**.
5. **الـ Services بتوصلها من جوه الكلاستر.** من اللاب بتاعك استخدم
   `kubectl port-forward`.
6. **التوزيع لكل كونيكشن مش لكل ريكوست.** الـ keep-alive بيبطّل التوزيع
   خالص، وعمل scale مش بينقل ترافيك موجود.
7. **Ingress للـ HTTP من بره** — ولازم يكون فيه controller منصّب، وإلا
   الورقة بتتجاهل من غير شكوى.
:::
