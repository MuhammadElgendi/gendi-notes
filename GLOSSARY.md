# Glossary

Terms that are used imprecisely in the wild, defined precisely here. Where a
note explains the mechanism, it is linked.

Terms are grouped by where the confusion usually is, not alphabetically —
looking one up is easier when its neighbours are the things it gets confused
with.

**The terms themselves stay in English, deliberately.** You have to recognise
them in the official documentation and say them out loud in an interview;
translating them would teach a private vocabulary that works nowhere else. The
*explanations* are bilingual — see the pairs table below, and the `:::ar` blocks
in every note.

---

## الفروق اللي بتتلخبط · the pairs people mix up

The whole glossary is worth reading, but these are the distinctions that cost
people interviews and outages. Each row is one confusion, settled.

| الكلمتين | الفرق في سطر | فين تقرا أكتر |
|:---|:---|:---|
| **Image** ضد **Container** | الـ image **ملف نايم على الديسك**، والـ container **عملية شغالة** منه | [Docker](02-containers/docker/docker.md) |
| **`request`** ضد **`limit`** | الـ request بيقرأها **الـ scheduler** مرة واحدة، والـ limit بيفرضها **الكيرنل** على طول | [Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md) |
| **Memory limit** ضد **CPU limit** | تعدّي الرام → **بيموت** (OOMKilled). تعدّي المعالج → **بيتخنق** ويبقى بطيء وعايش | [Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md) |
| **`Running`** ضد **`Ready`** | `Running` = العملية قامت. `Ready` = الـ probe بتنجح. **والـ Service بيبعت للـ Ready بس** | [Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md) |
| **readiness** ضد **liveness** | الـ readiness **بتشيل من الترافيك**. الـ liveness **بتقتل وترجّع** | [Kubernetes Deployments](03-kubernetes/deployments/kubernetes-deployments.md) |
| **`refused`** ضد **`timeout`** | `refused` = الجهاز **رد** ومفيش حاجة سامعة. `timeout` = **سكوت** = فايروول | [Networking Basics](00-foundations/networking/networking-basics.md) |
| **`SIGTERM`** ضد **`SIGKILL`** | `SIGTERM` **طلب** والبرنامج بيقدر يرد عليه. `SIGKILL` **مش بيوصله أصلاً** | [Linux Basics](00-foundations/linux/linux-basics.md) |
| **`kill`** ضد **`kill -9`** | الأول بيطلب بالذوق، والتاني بيفرض من غير أي تنظيف | [Linux Basics](00-foundations/linux/linux-basics.md) |
| **`reset`** ضد **`revert`** | `reset` **للمحلي**، `revert` **للمنشور**. والسؤال: «فيه حد تاني شافها؟» | [Git](01-devops/git/git.md) |
| **merge** ضد **rebase** | merge **بيحفظ** التاريخ، rebase **بيعيد كتابته** بهاشات جديدة | [Git](01-devops/git/git.md) |
| **`reload`** ضد **`restart`** | `reload` بيحافظ على الكونيكشنز، `restart` بيقطعها | [Linux Basics](00-foundations/linux/linux-basics.md) |
| **`df`** ضد **`du`** | `df` بيسأل الفايل سيستم عن **المحجوز**، `du` بيجمع **اللي شايفه** | [Linux Basics](00-foundations/linux/linux-basics.md) |
| **`dig`** ضد **`getent hosts`** | `dig` بيسأل الـ DNS، و `getent` بيمشي على **طريق تطبيقك الحقيقي** | [DNS](00-foundations/networking/dns.md) |
| **`port`** ضد **`targetPort`** | `port` بتاعة **الـ Service**، `targetPort` بتاعة **الكونتينر** | [Kubernetes Services](03-kubernetes/services/kubernetes-services.md) |
| **`emptyDir`** ضد **PVC** | `emptyDir` **بيموت مع البود**. الـ PVC بيعيش بعده | [Kubernetes Pods](03-kubernetes/pods/kubernetes-pods.md) |
| **`apply`** ضد **`create`** | `apply` بينفع تكرره وبيوصل لنفس النتيجة، `create` بيفشل لو الحاجة موجودة | [Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md) |
| **Continuous Delivery** ضد **Deployment** | الأول **جاهز للنشر** وبني آدم بيدوس، والتاني **بيتنشر لوحده** | [CI/CD](01-devops/ci-cd/ci-cd.md) |
| **`latest`** ضد tag ثابت | `latest` **استيكر حد بيحرّكه**، مش «الأحدث» | [Docker Images](02-containers/images/docker-images.md) |
| **`state rm`** ضد **`destroy`** | `state rm` **مش بيمسح المورد** — بيسيبه يتيم شغّال وبياكل فلوس | [Terraform](05-infrastructure-as-code/terraform/terraform.md) |
| **SLI / SLO / SLA** | قياس / هدف داخلي / **عقد بفلوس** | Reliability, below |
| **Utilisation** ضد **Saturation** | الأول «مشغول قد إيه»، والتاني **«فيه طابور قد إيه»** — والتاني هو مصدر البطء | Latency and load, below |

---

## Reliability

**SLI** — a *measurement* of service behaviour, expressed as good events ÷ valid
events. Just a number; missing it has no consequence.
→ [SLOs and Error Budgets](07-sre/error-budgets/slo-and-error-budgets.md)

**SLO** — an internal *target* for an SLI. Missing it triggers engineering
policy, not money.
→ [SLOs and Error Budgets](07-sre/error-budgets/slo-and-error-budgets.md)

**SLA** — an external *contract* with financial consequences. Always looser than
your SLO, so you notice before the customer's lawyer does.

**Error budget** — `1 − SLO` expressed as allowed failure. Its purpose is to
settle the ship-fast-vs-be-careful argument *before* it happens.
→ [SLOs and Error Budgets](07-sre/error-budgets/slo-and-error-budgets.md)

**Burn rate** — how fast the error budget is being consumed relative to
sustainable. Burn rate 1 = the budget lasts exactly the SLO window.

**Cardinality** — the number of distinct label-value combinations in a metric.
Each combination is one time series held in memory, which is why an unbounded
label (a user ID) exhausts a monitoring system rather than merely bloating it.
→ [Prometheus](08-observability/prometheus/prometheus.md)

**Toil** — manual, repetitive, automatable work that scales with service size and
has no enduring value. Not "work I dislike".

---

## Latency and load

**Utilisation** — the fraction of time a resource is busy. Cannot reveal
saturation, which is why CPU dashboards mislead.

**Saturation** — the amount of queued work a resource cannot service yet. **This
is where latency comes from.**

**Little's Law** — `L = λW`. Items in a system = arrival rate × time in system.
Why a small upstream slowdown produces a large latency increase downstream once a
pool saturates.

**Load average (Linux)** — runnable **plus uninterruptible-sleep** tasks. High
load with idle CPU usually means blocked I/O, not CPU pressure.
→ [Linux Command Cheat Sheet](14-cheat-sheets/linux/linux-commands.md)

**Throttling (CFS)** — a container exceeding its CPU quota is frozen for the rest
of the 100ms window. Reports **low** CPU utilisation while adding latency.
→ [Docker](02-containers/docker/docker.md)

**Tail latency** — the slow end of the distribution (p99, p99.9). The only part
users complain about; the part averages erase.

---

## Networking

**NAT** — rewriting addresses in a packet. **DNAT** rewrites the destination
(what a Service does); **SNAT** rewrites the source (what a NodePort does with
`externalTrafficPolicy: Cluster`).
→ [Kubernetes Services](03-kubernetes/services/kubernetes-services.md)

**conntrack** — the kernel's connection-tracking table. **Host-global**, so one
container can exhaust it for every other container on the node.

**MTU** — largest payload a link carries. Overlay encapsulation eats into it; a
mismatch lets the handshake succeed and then hangs on large payloads.

**Half-open connection** — one side has no record of a connection the other
believes is alive. Effectively undetectable by TCP alone.
→ [Networking Basics](00-foundations/networking/networking-basics.md)

**Half-closed connection** — one direction deliberately shut down with
`shutdown(SHUT_WR)`. Legal and intentional; unrelated to half-open.

**Accept queue** — completed connections waiting for `accept()`. Overflow means
the client believes it is connected while the server has dropped it.

**ndots** — how many dots a name needs before the resolver tries it as-is rather
than appending search domains. `ndots:5` in Kubernetes turns one external lookup
into up to ten queries.
→ [DNS](00-foundations/networking/dns.md)

---

## Containers and Kubernetes

**Container** — a process with namespaces (what it sees) and cgroups (what it
uses). Not a lightweight VM; it shares the host kernel.
→ [Docker](02-containers/docker/docker.md)

**Namespace (Linux)** — isolates *what a process can see*: PIDs, network,
mounts, users. Unrelated to a Kubernetes namespace.

**Namespace (Kubernetes)** — a name-scoping and RBAC boundary for API objects.
Not an isolation boundary by itself.

**cgroup** — limits *how much* a process group can use. Memory limits **kill**;
CPU limits **throttle**.

**CNI** — the plugin that gives Pods IPs and routes between nodes. Owns
Pod-to-Pod connectivity; knows nothing about Services.

**kube-proxy** — maintains kernel rules translating Service VIPs to Pod IPs. Not
a proxy: no traffic flows through the process.

**EndpointSlice** — the current, scalable list of ready backends for a Service.
Empty endpoints is the most common Service bug.
→ [Kubernetes Services](03-kubernetes/services/kubernetes-services.md)

**Readiness probe** — controls *membership* of the endpoint list. Failing it
removes traffic without restarting.

**Liveness probe** — restarts the container on failure. Can turn a slowdown into
an outage.
→ [Kubernetes Troubleshooting](03-kubernetes/troubleshooting/kubernetes-troubleshooting.md)

**Startup probe** — suspends liveness until the app has started. The fix for
slow-starting applications.

**CrashLoopBackOff** — a restart *policy* (backoff to a 5-minute cap), not a
failure type. Says nothing about the cause.

**Headless Service** — `clusterIP: None`. DNS returns Pod IPs directly; no VIP,
no kube-proxy.

---

## Data and caching

**Cache stampede / thundering herd** — many concurrent requests miss the same key
at the same instant and all hit the origin.

**Cache penetration** — repeated requests for a key that never exists. Fixed by
caching the negative result.

**Cache avalanche** — many keys expiring together, e.g. after a restart. Fixed by
TTL jitter and warm-up.

**Single-flight** — one request recomputes while the rest wait for its result.
The default stampede defence.

**Selectivity** — the fraction of rows a predicate eliminates. Low selectivity is
why the planner correctly ignores your index.

**Covering index** — contains every column a query needs, so the table itself is
never read.

**Write amplification** — one logical write causing several physical writes. Each
index adds one.

---

## Operations

**Blast radius** — what breaks when this fails. The organising question for
Terraform state splitting, cluster design and deployment strategy.
→ [Terraform](05-infrastructure-as-code/terraform/terraform.md)

**Drift** — reality diverging from declared state.

**Idempotent** — applying an operation twice has the same effect as once. What
makes retries safe.

**Graceful degradation** — shedding functionality to preserve core service.
Deliberate; distinct from partial failure, which is not.

**Fail open / fail closed** — on dependency failure, allow everything or deny
everything. Both are usually wrong; a *bounded* fallback is usually right.

**Retry storm** — timeouts causing retries causing load causing timeouts. Inverts
cause and effect: request rate climbs *because of* the latency.

**Thundering herd** — see cache stampede. Also applies to clients reconnecting
simultaneously after an outage; jittered backoff is the same fix.
