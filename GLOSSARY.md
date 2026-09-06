# Glossary

Terms that are used imprecisely in the wild, defined precisely here. Where a
note explains the mechanism, it is linked.

Terms are grouped by where the confusion usually is, not alphabetically —
looking one up is easier when its neighbours are the things it gets confused
with.

---

## Reliability

**SLI** — a *measurement* of service behaviour, expressed as good events ÷ valid
events. Just a number; missing it has no consequence.

**SLO** — an internal *target* for an SLI. Missing it triggers engineering
policy, not money.

**SLA** — an external *contract* with financial consequences. Always looser than
your SLO, so you notice before the customer's lawyer does.

**Error budget** — `1 − SLO` expressed as allowed failure. Its purpose is to
settle the ship-fast-vs-be-careful argument *before* it happens.

**Burn rate** — how fast the error budget is being consumed relative to
sustainable. Burn rate 1 = the budget lasts exactly the SLO window.

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
