---
title: Linux Network Namespaces
slug: linux-network-namespaces
type: concept
domain: 00-foundations
tags: [linux, networking, namespaces, containers]
level: 3
status: stable
prerequisites: [tcp-handshake]
related: [container-isolation, kubernetes-networking]
updated: 2026-09-05
---

# Linux Network Namespaces

> A container does not have a network — it has its own private copy of the kernel's networking stack.

## ① What is it?

A network namespace is an isolated instance of the Linux network stack: its own
interfaces, routing table, ARP table, iptables rules, socket table and port
space. Processes in different namespaces can both bind port 8080 without
conflict, because they are binding in **different stacks**.

Every container network model — Docker, Kubernetes, systemd-nspawn — is built
on this one primitive.

## ② Why does it exist?

Before namespaces, isolating two services on a host meant giving them different
ports, or different machines. Namespaces made it possible to give a *process
group* its own network identity without virtualising hardware.

```diagram
   WITHOUT NAMESPACES              WITH NAMESPACES
   ┌────────────────────┐          ┌──────────┐  ┌──────────┐
   │ one stack, one     │          │ netns A  │  │ netns B  │
   │ port space         │          │ :8080 ✓  │  │ :8080 ✓  │
   │ :8080 — first come │          │ own rt   │  │ own rt   │
   └────────────────────┘          └────┬─────┘  └────┬─────┘
                                        └── veth ─────┘
```

## ③ Mental Model

:::mental
Each namespace is a **separate machine sharing one kernel**. It has its own NICs
and routing table, and the only way in or out is a cable you plug in yourself
(a `veth` pair) or a device you move into it.

**Where it breaks down:** unlike a real machine, the namespace shares the host's
kernel, so kernel-wide limits (conntrack table size, `nf_conntrack_max`, socket
memory) are **global**. One container can exhaust a resource that every other
container depends on.
:::

## ④ How It Works

```diagram
       HOST NAMESPACE                    POD / CONTAINER NAMESPACE
   ┌─────────────────────┐            ┌──────────────────────────┐
   │  eth0  10.0.0.4     │            │  eth0   10.2.1.3         │
   │                     │            │  lo     127.0.0.1        │
   │  vethXXXX ══════════╪════════════╪══ (other end of the pair)│
   │     │               │            │  default via 10.2.1.1    │
   │     ▼               │            └──────────────────────────┘
   │  cni0 / bridge      │
   │     │               │              A veth pair is a virtual
   │  routing table      │              cable: bytes in one end
   └─────────────────────┘              come out the other.
```

1. Create the namespace — it starts with only a **down** loopback interface.
2. Create a `veth` pair (two linked virtual interfaces).
3. Move one end into the namespace; leave the other on the host.
4. Assign an address inside, add a default route, bring both ends up.
5. The host side is attached to a bridge or routed directly.

This is precisely what a CNI plugin does on every Pod creation — see
[[kubernetes-networking]].

## ⑤ Doing it by hand

Running this once teaches more than any diagram. Every step maps to something a
container runtime does for you.

```sh
# 1. Create a namespace. It is born nearly empty.
sudo ip netns add demo

# 2. Prove the isolation: only 'lo', and it is DOWN.
sudo ip netns exec demo ip addr

# 3. Create the virtual cable.
sudo ip link add veth-host type veth peer name veth-ns

# 4. Push one end inside.
sudo ip link set veth-ns netns demo

# 5. Address both ends and bring them up.
sudo ip addr add 10.200.0.1/24 dev veth-host
sudo ip link set veth-host up
sudo ip netns exec demo ip addr add 10.200.0.2/24 dev veth-ns
sudo ip netns exec demo ip link set veth-ns up
sudo ip netns exec demo ip link set lo up

# 6. It works — and this is exactly a Pod's connectivity to its node.
ping -c2 10.200.0.2

# Clean up.
sudo ip netns del demo
```

## ⑥ Finding a container's namespace

```sh
# Namespaces are file-like objects. Two processes showing the same net inode
# are in the SAME namespace — this is how you prove containers in a Pod
# share networking.
lsns -t net

# Enter a running container's network namespace with host tooling.
# Invaluable when the container image has no tcpdump, ss or ip.
PID=$(docker inspect -f '{{.State.Pid}}' <container>)
sudo nsenter -t "$PID" -n ss -tanp
```

:::senior
`nsenter -n` is the single most useful container-debugging technique there is.
Distroless and scratch images ship no shell and no network tools, so `kubectl
exec` gives you nothing. Entering the namespace from the host lets you run the
host's `tcpdump`, `ss` and `ip` **against the container's stack** — full
visibility, zero changes to the image.

The Kubernetes-native equivalent is `kubectl debug -it <pod> --image=nicolaka/
netshoot --target=<container>`, which attaches a debug container sharing the
target's namespaces.
:::

## ⑦ Failure Modes

| What breaks | Why | Signature |
|:---|:---|:---|
| Leaked `veth` interfaces | Namespace deleted, host end orphaned | `ip link` grows unbounded; ARP/neighbour pressure |
| conntrack exhaustion | The table is **host-global**, not per-namespace | Random drops across *unrelated* containers |
| MTU mismatch on veth | Host MTU differs from overlay MTU | Handshake fine, large payloads hang |
| Namespace pinned open | A process still holds a reference | `ip netns del` appears to work, resources stay |

:::failure
**One container can break every other container's networking.**

`nf_conntrack_max` is a kernel-wide limit. A single workload opening a very high
rate of short-lived connections fills the table, and the kernel then drops
*other* containers' packets with `nf_conntrack: table full` in `dmesg`.

The symptom is unattributable: several unrelated services degrade simultaneously
and none of them changed. Namespaces isolate *configuration*, not *kernel
resources* — this distinction is worth stating out loud in an interview.
:::

## ⑧ Senior Engineer Notes

**Namespaces are cheap; the bridge is not.** Creating a namespace and a veth
pair is microseconds. But every packet between namespaces on the same host
traverses the bridge and, if a Service VIP is involved, the netfilter hooks. At
high packet rates this cost dominates, which is what eBPF-based CNIs eliminate
by short-circuiting the path in the kernel.

**A namespace outlives its creator if something holds a reference.** Bind-mounting
`/proc/<pid>/ns/net` (which `ip netns add` does under `/var/run/netns`) keeps it
alive after every process exits. This is a feature — it is how you attach to a
Pod's namespace after its process restarts — and it is also how namespaces leak.

## ★ Key Takeaway

:::cloud
**1.** A network namespace is a private copy of the whole network stack:
interfaces, routes, iptables, ports.
**2.** A `veth` pair is a virtual cable; one end inside, one end on the host.
That is the entirety of container networking.
**3.** Namespaces isolate configuration, **not** kernel resources. conntrack and
socket memory remain global and shared.
**4.** `nsenter -t <pid> -n` gives you full host tooling against a container that
ships none.
:::

---

**Version note:** network namespaces have been stable since Linux 2.6.24. The
`ip netns` interface and `nsenter` behaviour are consistent across modern
distributions; verified on kernel 5.x/6.x.
