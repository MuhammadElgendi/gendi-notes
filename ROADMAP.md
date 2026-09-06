# Roadmap

A dependency graph, not a syllabus. The order matters because each stage makes
the next one comprehensible rather than merely memorisable.

**Legend:** ✅ written · ○ planned (directory exists, note does not yet)

---

## The spine

```diagram
  Linux ──▶ Networking ──▶ Git ──▶ Containers ──▶ CI/CD ──▶ Cloud
                                        │
                                        ▼
                                   Kubernetes ──▶ Terraform
                                        │
                                        ▼
                                 Observability ──▶ SRE
                                        │
                                        ▼
                            Distributed Systems ──▶ System Design
                                        │
                                        ▼
                              Platform Engineering
                                        │
                                        ▼
                                Senior / Staff
```

The single most common mistake in this field is entering at Kubernetes. It is
learnable that way, but only as a set of commands — every debugging session then
bottoms out in Linux and networking concepts you skipped, and you cannot tell a
Kubernetes problem from a Linux problem wearing a Kubernetes hat.

---

## Stage 1 — Foundations

*Everything below assumes this stage. There is no shortcut through it.*

| | Note | Level |
|:--|:---|:---|
| ✅ | [Linux Processes and Signals](00-foundations/linux/linux-processes.md) | L2 |
| ✅ | [TCP Handshake and Connection State](00-foundations/networking/tcp-handshake.md) | L2 |
| ✅ | [DNS Resolution](00-foundations/networking/dns-resolution.md) | L2 |
| ✅ | [Linux Network Namespaces](00-foundations/linux/linux-network-namespaces.md) | L3 |
| ○ | Filesystems and the page cache | L2 |
| ○ | Linux memory management | L3 |
| ○ | IP routing and subnets | L2 |
| ○ | TLS handshake | L3 |

**You are ready to move on when** you can explain what `D` state means, why
`kill -9` sometimes does nothing, and what happens between typing a hostname and
the first byte arriving.

---

## Stage 2 — Containers

Depends on: **processes + namespaces**.

| | Note | Level |
|:--|:---|:---|
| ✅ | [What a Container Actually Is](02-containers/docker/container-isolation.md) | L3 |
| ○ | Image layers and build caching | L2 |
| ○ | Container runtimes: CRI, containerd, runc | L3 |
| ○ | Registry authentication and image supply chain | L3 |

**Ready when** you can say precisely why a container is not a VM — in terms of
kernels, not weight — and explain why a memory limit kills but a CPU limit does
not.

---

## Stage 3 — Kubernetes

Depends on: **containers + Linux networking + DNS**. This is where skipping
Stage 1 becomes expensive.

```diagram
  Kubernetes networking REQUIRES:
        Linux net namespaces  +  TCP/IP  +  DNS  +  routing  +  iptables/eBPF
                    │
                    ▼
        without these, "kube-proxy writes iptables rules"
        is a sentence you can repeat but not use
```

| | Note | Level |
|:--|:---|:---|
| ✅ | [Kubernetes Networking](03-kubernetes/networking/kubernetes-networking.md) | L3 |
| ✅ | [Kubernetes Services](03-kubernetes/services/kubernetes-services.md) | L3 |
| ✅ | [Kubernetes DNS and CoreDNS](03-kubernetes/dns/kubernetes-dns.md) | L3 |
| ✅ | [Pod in CrashLoopBackOff](03-kubernetes/troubleshooting/pod-crashloopbackoff.md) | L2 |
| ○ | Control plane architecture | L3 |
| ○ | Scheduling and affinity | L3 |
| ○ | Requests, limits and QoS classes | L3 |
| ○ | StatefulSets and storage | L4 |
| ○ | RBAC | L3 |
| ○ | Safe cluster upgrades | L4 |

**Ready when** you can trace a request from client to container naming every hop,
and debug an empty-endpoints Service without looking anything up.

---

## Stage 4 — Infrastructure as Code

Depends on: **cloud primitives**. Can run in parallel with Kubernetes.

| | Note | Level |
|:--|:---|:---|
| ✅ | [Terraform State](05-infrastructure-as-code/terraform/terraform-state.md) | L3 |
| ○ | Modules and composition | L3 |
| ○ | Provider behaviour and lifecycle rules | L4 |
| ○ | Multi-environment patterns | L4 |

---

## Stage 5 — Observability and SRE

Depends on: **running something in production**. This stage is not learnable in
the abstract; it needs a system whose failure you care about.

| | Note | Level |
|:--|:---|:---|
| ✅ | [SLI, SLO, SLA and Error Budgets](07-sre/sli-slo-sla/sli-slo-sla.md) | L3 |
| ✅ | [Linux Performance Triage](14-cheat-sheets/troubleshooting/linux-performance-triage.md) | L3 |
| ✅ | [High Latency with Normal CPU](15-production/troubleshooting-playbooks/high-latency-normal-cpu.md) | L4 |
| ○ | Metrics, logs and traces: what each is for | L2 |
| ○ | Prometheus data model and cardinality | L3 |
| ○ | Alerting that does not page you at 3am for nothing | L4 |
| ○ | Incident command and comms | L4 |
| ○ | Postmortems that change something | L4 |

**Ready when** you can look at a latency graph and say which resource is
saturated before opening a single dashboard.

---

## Stage 6 — Data and Distributed Systems

| | Note | Level |
|:--|:---|:---|
| ✅ | [Database Indexes](09-databases/indexing/database-indexes.md) | L3 |
| ✅ | [Cache Stampede](12-system-design/caching/cache-stampede.md) | L4 |
| ○ | Transactions and isolation levels | L4 |
| ○ | Replication and read replicas | L4 |
| ○ | CAP, and what it actually forbids | L4 |
| ○ | Consensus: Raft | L5 |
| ○ | Idempotency and exactly-once delivery | L4 |

---

## Stage 7 — System Design

Depends on: **everything above**. System design is not a separate skill — it is
the ability to apply the previous six stages under ambiguity.

| | Note | Level |
|:--|:---|:---|
| ✅ | [Design — Distributed Rate Limiter](12-system-design/complete-designs/rate-limiter.md) | L4 |
| ○ | Estimation and capacity arithmetic | L3 |
| ○ | Queues vs streams | L4 |
| ○ | Design — URL shortener | L3 |
| ○ | Design — notification system | L4 |

---

## Stage 8 — Interviews

Run this **alongside** the stages, not after. The interview note tests; the
concept note teaches. Reading the interview note first teaches you to recite.

| | Note | Level |
|:--|:---|:---|
| ✅ | [Kubernetes Networking — Interview Questions](13-interviews/senior/kubernetes-networking-questions.md) | L4 |
| ○ | Linux troubleshooting questions | L3 |
| ○ | SRE and reliability questions | L4 |
| ○ | Trick questions and the traps in them | L4 |
| ○ | Behavioural, for senior and staff | L4 |

---

## Key dependencies, stated explicitly

Cross-cutting prerequisites that are easy to miss:

| To understand… | You first need… |
|:---|:---|
| Kubernetes networking | Linux net namespaces, TCP/IP, DNS, routing, iptables/eBPF |
| Kubernetes Services | Kubernetes networking, readiness probes, EndpointSlices |
| Service mesh | Kubernetes networking, TLS, proxies, sidecars |
| Terraform state | Cloud IAM, object storage, locking primitives |
| SLOs | Percentiles, and a production system you actually operate |
| Cache design | Consistency models, failure modes, origin capacity |
| Database indexes | Disk I/O, B-trees, query planning |
| Distributed consensus | Replication, quorums, failure modes, partial failure |

---

## Levels, and what changes between them

| Level | You can… |
|:---|:---|
| **L1** | Explain the mechanism plainly |
| **L2** | Use it correctly and read the errors |
| **L3** | Predict how it fails and debug it in production |
| **L4** | Defend the trade-offs and say when *not* to use it |
| **L5** | Design the thing itself, and name what your design is bad at |

The jump that matters for senior interviews is **L3 → L4**: from knowing how
something breaks to knowing what you gave up to have it at all.
