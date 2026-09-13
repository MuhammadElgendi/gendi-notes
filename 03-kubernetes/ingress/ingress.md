---
title: Ingress and TLS
slug: ingress
type: guide
domain: 03-kubernetes
tags: [kubernetes, ingress, tls, networking]
keywords: [ingress controller, nginx, traefik, ingressclass, cert-manager,
           lets encrypt, tls termination, gateway api, host routing, path,
           انجرس, شهادات, تشفير, توجيه]
level: 2
status: stable
prerequisites: [kubernetes-services, dns]
related: [kubernetes-services, dns, kubernetes-architecture,
          devops-interview-questions]
updated: 2026-09-13
---

# Ingress and TLS

> An Ingress object is a set of routing rules that does nothing on its own. A **controller** has to be installed to read it — and "my Ingress is ignored" is almost always that it is not.

## What is it?

An Ingress routes external HTTP(S) traffic to Services, by hostname and path,
through **one** load balancer shared by every application.

```diagram
   internet
      │
      ↓
   ┌──────────────────────────────────┐
   │  cloud LoadBalancer (ONE, shared)│
   └──────────────────────────────────┘
      │
      ↓
   ┌──────────────────────────────────┐
   │  Ingress CONTROLLER pods         │  nginx / Traefik / HAProxy
   │  · terminates TLS                │  ← these do the actual work
   │  · matches host + path           │
   └──────────────────────────────────┘
      │
      ├── api.example.com     ──→ Service: api  ──→ pods
      ├── example.com/shop    ──→ Service: shop ──→ pods
      └── example.com/        ──→ Service: web  ──→ pods
```

:::ar
الـ Ingress بيوجّه ترافيك الـ HTTP الجاي من الإنترنت للسيرفيسات بتاعتك،
**على حسب اسم الدومين والمسار**، ومن خلال **load balancer واحد** كل
التطبيقات بتشاركه.

**وأهم حاجة تفهمها من الرسمة:** فيه **حاجتين مختلفتين** اسمهم متشابه:

| الحاجة | إيه هي |
|:---|:---|
| **Ingress** (الأوبجكت) | **ورقة مكتوب فيها قواعد.** مجرد YAML |
| **Ingress Controller** | **البرنامج اللي بيقرا الورقة وينفّذها** |

**والأوبجكت لوحده مش بيعمل أي حاجة خالص.**

فلو عملت `kubectl apply` لـ Ingress ومفيش controller منصّب، الأمر
**هينجح**، **ومفيش أي حاجة هتحصل** — ومحدش هيقولك ليه.

**ودي أشهر مشكلة مع الـ Ingress على الإطلاق.**
:::

## Why it exists

Without it, exposing ten services means ten `LoadBalancer` Services:

| | A LoadBalancer per Service | One Ingress |
|:---|:---|:---|
| Cloud load balancers | 10 — and 10 bills | 1 |
| TLS certificates | Configured 10 times | Managed centrally |
| Path-based routing | Not possible | `/api` and `/` to different services |
| Adding a service | Provision another LB, wait, update DNS | One more rule |

:::key Ingress is HTTP-aware; a Service is not
A `Service` is layer 4 — it forwards TCP to a pod and knows nothing about what
is inside. It cannot read a `Host:` header or a URL path, so it cannot route on
them.

An Ingress controller is a **reverse proxy** at layer 7. It parses the request,
which is what lets it route by hostname and path, terminate TLS, rewrite paths
and set headers.

That is also why Ingress only handles HTTP/HTTPS. For raw TCP or UDP you still
need a `LoadBalancer` Service, or your controller's TCP-passthrough extension.
:::

:::ar ليه موجود؟
من غيره، عشان تكشف ١٠ سيرفيسات، محتاج **١٠ load balancers**.

| | LB لكل سيرفيس | Ingress واحد |
|:---|:---|:---|
| عدد الـ LBs | ١٠ — و **١٠ فواتير** | **١** |
| شهادات TLS | بتظبّطها ١٠ مرات | في مكان واحد |
| التوجيه بالمسار | **مستحيل** | `/api` لسيرفيس و `/` لتاني |
| تضيف سيرفيس | تعمل LB جديد وتستنى | **قاعدة واحدة** |

:::key والفرق الجوهري: الـ Ingress **بيفهم HTTP**، والـ Service **لأ**
الـ **Service** بيشتغل على **الطبقة الرابعة** — بيوصّل TCP لبود، **ومش
عارف أي حاجة عن اللي جوه البكتات**.

فهو **مش قادر** يقرا `Host:` header ولا مسار URL — **فمش قادر يوجّه بيهم**.

والـ **Ingress controller** ده **reverse proxy على الطبقة السابعة**. هو
**بيفك الريكوست ويقراه** — وعشان كده بيقدر يوجّه بالدومين والمسار، ويفك
تشفير TLS، ويعدّل المسارات والـ headers.

**وعشان كده كمان الـ Ingress بيتعامل مع HTTP/HTTPS بس.**

فلو محتاج TCP خام أو UDP (زي داتابيز أو لعبة)، **لسه محتاج
`LoadBalancer` Service** أو امتداد خاص في الـ controller بتاعك.
:::
:::

## How to use it

### Install a controller first

```sh
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# It creates ONE LoadBalancer Service. This is the address DNS points at.
kubectl get svc -n ingress-nginx
kubectl get ingressclass
```

### An Ingress with TLS

```yaml title="ingress.yaml"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod   # issues the cert
spec:
  ingressClassName: nginx        # MUST match an installed IngressClass
  tls:
    - hosts: [example.com, api.example.com]
      secretName: site-tls       # cert-manager CREATES this Secret
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port: { number: 80 }
    - host: example.com
      http:
        paths:
          - path: /shop
            pathType: Prefix
            backend:
              service: { name: shop, port: { number: 80 } }
          - path: /
            pathType: Prefix
            backend:
              service: { name: web, port: { number: 80 } }
```

| Field | Gotcha |
|:---|:---|
| `ingressClassName` | Wrong value → **silently ignored**. Check `kubectl get ingressclass` |
| `pathType` | `Prefix` (usual), `Exact`, or `ImplementationSpecific` |
| `tls.secretName` | Must be in the **same namespace** as the Ingress |
| Path order | Controllers match **most specific first**, not file order |

### Automatic certificates with cert-manager

```sh
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set crds.enabled=true
```

```yaml title="clusterissuer.yaml"
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: letsencrypt-prod }
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: you@example.com
    privateKeySecretRef: { name: letsencrypt-prod-account-key }
    solvers:
      - http01:
          ingress: { ingressClassName: nginx }
```

Now the annotation on the Ingress is enough: cert-manager requests the
certificate, proves control of the domain, writes the Secret, and renews it
before expiry.

```sh title="When a certificate does not appear, follow the chain"
kubectl get certificate,certificaterequest,order,challenge -A
kubectl describe challenge <name>    # the ACME failure reason is here
```

:::warn HTTP-01 validation needs port 80 reachable from the internet
Let's Encrypt proves you control the domain by fetching
`http://<host>/.well-known/acme-challenge/<token>` — **over plain HTTP**.

So it fails if port 80 is blocked, if you redirect all HTTP to HTTPS *before*
the challenge path is served, or if DNS does not yet point at the load
balancer. The controller handles the redirect exception for you; a firewall
does not.

For wildcard certificates, or when port 80 cannot be exposed, use **DNS-01**
instead — it proves control by writing a TXT record, and needs credentials for
your DNS provider.
:::

:::ar التنصيب والشهادات
**أول حاجة: نصّب controller.** من غيره الـ Ingress ورقة مالهاش قيمة.

```sh
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

kubectl get svc -n ingress-nginx     # ده الـ LB اللي الـ DNS هيشاور عليه
kubectl get ingressclass             # ودي الأسماء المتاحة لـ ingressClassName
```

**والشهادات: cert-manager بيعملها لوحده.**

إنت بتحط annotation واحدة على الـ Ingress، وهو:

1. بيطلب الشهادة من Let's Encrypt
2. **بيثبت إنك بتملك الدومين**
3. بيكتب الـ Secret
4. **وبيجدّدها لوحده قبل ما تنتهي**

:::danger و HTTP-01 محتاجة **بورت ٨٠ مفتوح للإنترنت**
Let's Encrypt بيثبت ملكيتك للدومين بإنه **يجيب ملف من موقعك على HTTP
عادي** (مش HTTPS):

```text
http://<الدومين>/.well-known/acme-challenge/<token>
```

**فهي بتفشل لو:**

- **بورت ٨٠ مقفول** في الفايروول
- **الـ DNS لسه مش بيشاور** على الـ load balancer
- أو إنت بتحوّل كل HTTP لـ HTTPS **قبل** ما مسار التحدي يتخدم

والـ controller بيتعامل مع استثناء التحويل ده **لوحده** — **بس
الفايروول لأ**.

**ولو محتاج شهادة wildcard** (زي `*.example.com`)، أو مش قادر تفتح
٨٠، **استخدم DNS-01** — دي بتثبت الملكية بإنها **تكتب TXT record**،
ومحتاجة صلاحيات على مزوّد الـ DNS بتاعك.

**ولما الشهادة متظهرش، اتبع السلسلة:**

```sh
kubectl get certificate,certificaterequest,order,challenge -A
kubectl describe challenge <name>     # ← سبب الفشل مكتوب هنا
```
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| Ingress created, nothing happens | **No controller**, or wrong `ingressClassName` | `kubectl get ingressclass` |
| `ADDRESS` column empty | Controller has no LoadBalancer, or the cloud cannot provision one | `kubectl get svc -n ingress-nginx` |
| 404 from the controller | No rule matched the `Host` header | Check the host spelling and DNS |
| 502 / 503 | Backend Service has **no endpoints** | `kubectl get endpoints <svc>` |
| 404 on a path that should work | Path rewriting not configured | Add the controller's rewrite annotation |
| TLS serves the default certificate | The `tls` Secret is missing or in another namespace | `kubectl get secret <name> -n <ingress-ns>` |
| Certificate stuck `False` | ACME challenge failing | `kubectl describe challenge` |
| Works on HTTP, redirect loop on HTTPS | TLS terminated at the LB **and** the controller redirects again | Trust `X-Forwarded-Proto`, or terminate in one place |

:::danger `ENDPOINTS: <none>` is still the first thing to check
An Ingress routes to a **Service**, and a Service with no endpoints has nothing
behind it. The controller then returns 503 and the Ingress looks broken, when
the actual fault is one layer down — a selector typo or a failing readiness
probe.

```sh
kubectl get ingress            # is there an ADDRESS?
kubectl get endpoints <svc>    # <none> → the real problem is here
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller
```

Work bottom-up: pod Ready → Service has endpoints → Ingress rule matches → DNS
points at the load balancer. Skipping to the top wastes the most time.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| الـ Ingress اتعمل ومفيش حاجة | **مفيش controller** أو `ingressClassName` غلط | `kubectl get ingressclass` |
| عمود `ADDRESS` فاضي | الـ controller مالوش LB | `kubectl get svc -n ingress-nginx` |
| 404 من الـ controller | مفيش قاعدة طابقت الـ `Host` | شيك الاسم والـ DNS |
| **502 / 503** | السيرفيس **مفيهوش endpoints** | `kubectl get endpoints <svc>` |
| TLS بيعرض شهادة افتراضية | الـ Secret ناقص أو في namespace تانية | لازم **نفس** الـ namespace |
| الشهادة واقفة `False` | تحدي ACME بيفشل | `kubectl describe challenge` |
| لوب تحويل لا نهائي على HTTPS | TLS بيتفك في الـ LB **والـ controller بيحوّل تاني** | وثّق `X-Forwarded-Proto` |

:::danger و `ENDPOINTS: <none>` لسه أول حاجة تشيكها
الـ Ingress بيوجّه لـ **Service**، **والسيرفيس اللي مفيهوش endpoints
مفيش وراه حاجة**.

فالـ controller بيرجّع 503، **والـ Ingress شكله باظ** — **والعطل
الحقيقي طبقة تحت**: غلطة في الـ selector أو readiness probe بتفشل.

**امشي من تحت لفوق:**

```diagram
   ① البود Ready؟
        ↓
   ② السيرفيس عنده endpoints؟     ← <none> يبقى وقفت هنا
        ↓
   ③ قاعدة الـ Ingress بتطابق؟
        ↓
   ④ الـ DNS بيشاور على الـ LB؟
```

**واللي بيبدأ من فوق بيضيّع أطول وقت.**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is the difference between a LoadBalancer Service and an Ingress?
**Layer 4 versus layer 7**, and that difference produces all the others.

| | `LoadBalancer` Service | Ingress |
|:---|:---|:---|
| Layer | 4 — TCP/UDP | 7 — HTTP/HTTPS |
| Can route by hostname or path | **No** | **Yes** |
| TLS termination | At the cloud LB, if configured | At the controller |
| Cloud load balancers needed | **One per Service** | **One, shared** |
| Works for non-HTTP | **Yes** | No |
| Needs a controller installed | No | **Yes** |

A Service cannot read a `Host:` header because it never parses the payload — it
rewrites packet destinations. An Ingress controller is a reverse proxy that
terminates the connection, reads the request, and opens a new one to the pod.

**Which is why:** Ingress is for HTTP fan-in, and `LoadBalancer` remains the
answer for databases, gRPC where you want raw TCP, game servers, and anything
not HTTP.

:::key Worth adding: Gateway API
Ingress is effectively feature-frozen. Everything beyond basic host/path
routing is done through **controller-specific annotations**, which makes
configuration non-portable — an nginx Ingress does not move to Traefik.

**Gateway API** is the successor: a richer, role-oriented, properly typed API
(`GatewayClass`, `Gateway`, `HTTPRoute`) that splits infrastructure ownership
from route ownership. Mentioning it shows you follow where Kubernetes is going,
not just where it has been.
:::

:::ar
**الفرق: الطبقة الرابعة مقابل السابعة** — وكل الفروق التانية بتطلع من دي.

| | `LoadBalancer` Service | Ingress |
|:---|:---|:---|
| الطبقة | ٤ — TCP/UDP | ٧ — HTTP/HTTPS |
| توجيه بالدومين أو المسار | **لأ** | **أيوه** |
| عدد الـ LBs | **واحد لكل سيرفيس** | **واحد للكل** |
| بيشتغل مع غير HTTP | **أيوه** | لأ |
| محتاج controller | لأ | **أيوه** |

الـ Service **مش قادر** يقرا `Host:` عشان هو **عمره ما بيفك الحمولة** —
هو بيعدّل عناوين البكتات وبس.

والـ Ingress controller **بروكسي** بيقفل الاتصال ويقرا الريكوست
**ويفتح اتصال جديد** للبود.

**وعشان كده:** الـ Ingress للـ HTTP، **والـ `LoadBalancer` لسه هو
الإجابة** للداتابيزات، و gRPC لو عايز TCP خام، وسيرفرات الألعاب.

**والإضافة اللي تستاهل: الـ Gateway API**

الـ Ingress عملياً **اتجمّد**. وأي حاجة أكتر من توجيه بسيط بتتعمل
بـ **annotations خاصة بكل controller** — **وده بيخلي الإعدادات مش
قابلة للنقل**: Ingress بتاع nginx **مش بينتقل** لـ Traefik.

**والـ Gateway API هو الخليفة**: واجهة أغنى ومقسّمة على الأدوار
(`GatewayClass`، `Gateway`، `HTTPRoute`)، **بتفصل ملكية البنية التحتية
عن ملكية المسارات**.

وإنك تذكرها بتوري إنك **متابع كوبرنيتيس رايح فين**، مش بس كان فين.
:::
:::

:::q An Ingress returns 503. Walk me through it.
503 from an Ingress controller almost always means **the controller has no
healthy backend**, not that the controller is broken. Work bottom-up:

```sh
# 1. Does the Service have endpoints? This answers it most of the time.
kubectl get endpoints <svc>          # <none> → stop here

# 2. If empty: selector mismatch, or pods not Ready?
kubectl get pods --show-labels
kubectl get svc <svc> -o jsonpath='{.spec.selector}{"\n"}'

# 3. If endpoints exist: does the Ingress point at the right Service and port?
kubectl describe ingress site

# 4. What does the controller itself say?
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=50
```

| Finding | Cause |
|:---|:---|
| `ENDPOINTS: <none>` | Selector typo, or every pod failing readiness |
| Endpoints exist, still 503 | Ingress names a wrong Service or port |
| 503 only during deploys | Endpoint de-registration race — add a `preStop` sleep |
| 503 for one host only | That rule's backend is broken; others are fine |

:::key
The signal is whether you go **bottom-up**. 503 is emitted by the proxy, so the
instinct is to debug the proxy — but the proxy is usually reporting honestly
that there is nothing to send to. Checking endpoints first eliminates the
common case in one command.
:::

:::ar
الـ 503 من الـ Ingress معناها تقريباً دايماً إن **الـ controller مش لاقي
backend سليم** — **مش** إن الـ controller باظ.

**امشي من تحت لفوق:**

```sh
kubectl get endpoints <svc>          # ١. <none>؟ وقفت هنا
kubectl get pods --show-labels       # ٢. selector غلط ولا البودات مش Ready؟
kubectl describe ingress site        # ٣. بيشاور على السيرفيس والبورت الصح؟
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=50
```

| اللي لقيته | السبب |
|:---|:---|
| `ENDPOINTS: <none>` | غلطة في الـ selector، أو كل البودات بتفشل في الـ readiness |
| فيه endpoints وبرضه 503 | الـ Ingress بيسمّي سيرفيس أو بورت غلط |
| 503 **وقت الديبلوي بس** | سباق إلغاء التسجيل — حط `preStop` فيه `sleep` |
| 503 لدومين واحد بس | الـ backend بتاع القاعدة دي بس هو الباظ |

**واللي بيتقاس عليه إنك تمشي من تحت لفوق.**

الـ 503 **بيطلع من البروكسي**، فالغريزة بتقولك ظبّط البروكسي — **والبروكسي
غالباً بيبلّغ بصدق إن مفيش حاجة يبعتلها**.

**وشيك الـ endpoints الأول بيشيل الحالة الشائعة في أمر واحد.**
:::
:::

## Key takeaways

- **An Ingress object does nothing without a controller.** "It is ignored" is
  almost always a missing controller or a wrong `ingressClassName`.
- **Ingress is layer 7**, so it can route by host and path; a Service cannot.
- **One load balancer, many services** — that is the cost saving.
- **503 means no healthy endpoints.** Check `kubectl get endpoints` first.
- **The TLS Secret must be in the Ingress's namespace.**
- **HTTP-01 needs port 80 reachable**; use DNS-01 for wildcards.
- **Gateway API is the successor** — worth knowing as Ingress is feature-frozen.

:::ar الخلاصة
1. **الـ Ingress مش بيعمل حاجة من غير controller.** «بيتجاهلني» معناها
   غالباً **مفيش controller** أو `ingressClassName` غلط.
2. **الـ Ingress على الطبقة السابعة**، فبيقدر يوجّه بالدومين والمسار.
   **والـ Service مش قادر.**
3. **load balancer واحد لكل السيرفيسات** — ودي هي التوفيرة.
4. **الـ 503 معناها مفيش endpoints سليمة.** شيك `get endpoints` **الأول**.
5. **Secret الـ TLS لازم يكون في نفس namespace الـ Ingress.**
6. **HTTP-01 محتاجة بورت ٨٠ مفتوح**، و DNS-01 للـ wildcards.
7. **الـ Gateway API هو الخليفة** — الـ Ingress اتجمّد عملياً.
:::
