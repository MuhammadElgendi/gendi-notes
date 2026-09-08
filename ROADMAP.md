# Roadmap

A dependency order, not a syllabus. Each stage makes the next one
understandable rather than merely memorisable.

**Legend:** ✅ written · ○ planned

---

## The path

```diagram
   Linux ──→ Networking ──→ Git ──→ Docker ──→ CI/CD
                                       │
                                       ↓
                                  Kubernetes ──→ Terraform
                                       │
                                       ↓
                              Observability ──→ SRE
                                       │
                                       ↓
                         Databases ──→ System Design
```

The most common mistake in this field is starting at Kubernetes. It is possible,
but you end up memorising commands — and every debugging session eventually
bottoms out in Linux and networking concepts you skipped.

**How to read a note.** Each section is written twice: once in English, once in
Egyptian Arabic (`بالمصري`). Read the English first — the terms are the ones you
will meet in the documentation — then the Arabic, which explains the same idea
from the beginning and usually answers the "…but what does that *mean*?" the
English left implicit. Then work the **Interview corner** at the end as a quiz
before you read its answers.

---

## Stage 1 — Foundations

Everything below assumes this stage. There is no shortcut through it.

| | Note | Level |
|:--|:---|:---|
| ✅ | [Linux Basics](00-foundations/linux/linux-basics.md) | L1 |
| ✅ | [Networking Basics](00-foundations/networking/networking-basics.md) | L1 |
| ✅ | [DNS](00-foundations/networking/dns.md) | L1 |
| ✅ | [SSH](00-foundations/linux/ssh.md) | L1 |
| ✅ | [Linux Command Cheat Sheet](14-cheat-sheets/linux/linux-commands.md) | L1 |
| ○ | Files, permissions and the page cache in depth | L2 |
| ○ | TLS and certificates | L2 |

**Move on when** you can explain the difference between "connection refused" and
a timeout, and find which process is using a port.

---

## Stage 2 — Version control and containers

| | Note | Level |
|:--|:---|:---|
| ✅ | [Git](01-devops/git/git.md) | L1 |
| ✅ | [Docker](02-containers/docker/docker.md) | L1 |
| ✅ | [Docker Images and Registries](02-containers/images/docker-images.md) | L2 |
| ○ | Container runtimes: CRI, containerd, runc | L3 |

**Move on when** you can write a Dockerfile that caches properly and explain why
a container is not a small VM.

---

## Stage 3 — Automation

| | Note | Level |
|:--|:---|:---|
| ✅ | [CI/CD](01-devops/ci-cd/ci-cd.md) | L2 |
| ○ | GitHub Actions in depth | L2 |
| ○ | Artifact management and versioning | L2 |

---

## Stage 4 — Kubernetes

Depends on **Docker + Linux networking + DNS**. This is where skipping Stage 1
becomes expensive.

```diagram
   Kubernetes networking needs:
      Linux namespaces + TCP/IP + DNS + routing
                    │
                    ↓
      without these, "kube-proxy writes iptables rules"
      is a sentence you can repeat but not use
```

| | Note | Level |
|:--|:---|:---|
| ✅ | [Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md) | L1 |
| ✅ | [Kubernetes Pods](03-kubernetes/pods/kubernetes-pods.md) | L2 |
| ✅ | [Kubernetes Deployments](03-kubernetes/deployments/kubernetes-deployments.md) | L2 |
| ✅ | [Kubernetes Services](03-kubernetes/services/kubernetes-services.md) | L2 |
| ✅ | [Kubernetes Troubleshooting](03-kubernetes/troubleshooting/kubernetes-troubleshooting.md) | L2 |
| ✅ | [kubectl Cheat Sheet](14-cheat-sheets/kubernetes/kubectl-commands.md) | L1 |
| ○ | ConfigMaps and Secrets | L2 |
| ○ | Ingress and TLS | L2 |
| ○ | Storage: PV, PVC, StorageClass | L3 |
| ○ | RBAC | L3 |
| ○ | Autoscaling: HPA, VPA, Cluster Autoscaler | L3 |
| ○ | Cluster upgrades | L4 |

**Move on when** you can trace a request from the internet to a container and
debug an empty-endpoints Service without looking it up.

---

## Stage 5 — Infrastructure as Code

| | Note | Level |
|:--|:---|:---|
| ✅ | [Terraform](05-infrastructure-as-code/terraform/terraform.md) | L2 |
| ○ | Modules and composition | L3 |
| ○ | Multi-environment patterns | L3 |

---

## Stage 6 — Observability and SRE

This stage is not learnable in the abstract. It needs a running system whose
failure you care about.

| | Note | Level |
|:--|:---|:---|
| ✅ | [Prometheus](08-observability/prometheus/prometheus.md) — including PromQL and cardinality | L2 |
| ✅ | [SLOs and Error Budgets](07-sre/error-budgets/slo-and-error-budgets.md) | L3 |
| ○ | Metrics, logs and traces: what each is for | L2 |
| ○ | Grafana dashboards | L2 |
| ○ | Alerting that does not page you for nothing | L3 |
| ○ | Incident response | L3 |
| ○ | Postmortems | L3 |

---

## Stage 7 — Data and design

| | Note | Level |
|:--|:---|:---|
| ○ | PostgreSQL basics | L2 |
| ○ | Database indexes | L3 |
| ○ | Transactions and isolation levels | L3 |
| ○ | Replication and read replicas | L3 |
| ○ | Caching, and cache stampedes | L3 |
| ○ | Queues and message brokers | L3 |
| ○ | System design: estimation and building blocks | L3 |

---

## Stage 8 — Interviews

Run this **alongside** the stages, not after. The concept note teaches; the
interview note tests. Reading the interview note first teaches you to recite.

| | Note | Level |
|:--|:---|:---|
| ✅ | [DevOps Interview Questions](13-interviews/devops/devops-interview-questions.md) | L4 |
| ✅ | [Troubleshooting Scenarios](13-interviews/troubleshooting/troubleshooting-scenarios.md) | L4 |
| ✅ | [Interview Tips and Tricks](13-interviews/devops/interview-tips-and-tricks.md) | L4 |
| ○ | SRE and reliability questions | L3 |
| ○ | System design questions | L4 |
| ○ | Behavioural, by level | L3 |

Every topic note also ends with its own **Interview corner** — three to six
questions specific to that topic, collapsed so the page works as a quiz first.
Those are the drill; the notes above are the method.

---

## Prerequisites worth stating explicitly

| To understand… | You first need… |
|:---|:---|
| Kubernetes networking | Linux namespaces, TCP/IP, DNS, routing |
| Kubernetes Services | Pods, labels, readiness probes |
| Terraform state | Cloud IAM, object storage, locking |
| CI/CD pipelines | Git branching, Docker images |
| Caching design | Consistency, failure modes, origin capacity |
| Database indexes | Disk I/O, B-trees, query planning |
| SLOs | Percentiles, and a system you actually operate |

---

## What the levels mean

| Level | You can… |
|:---|:---|
| **L1** | Explain it and use it for the first time |
| **L2** | Use it correctly day to day and read the errors |
| **L3** | Predict how it fails and debug it in production |
| **L4** | Defend the trade-offs and say when *not* to use it |
| **L5** | Design it, and name what your design is bad at |

The jump that matters for senior interviews is **L3 → L4**: from knowing how
something breaks to knowing what you gave up to have it at all.
