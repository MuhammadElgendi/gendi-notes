---
title: Networking Basics
slug: networking-basics
type: guide
domain: 00-foundations
tags: [networking, tcp, ip, ports]
keywords: [ip address, subnet, port, tcp, udp, firewall, nat, cidr, curl]
level: 1
status: stable
prerequisites: []
related: [dns, linux-basics, ssh]
updated: 2026-09-06
---

# Networking Basics

> Every "it can't connect" problem is one of four things: wrong address, wrong port, a firewall, or nothing listening.

## What is it?

Networking is how one machine reaches another. To make a connection you need
exactly two pieces of information:

- an **IP address** — *which machine*
- a **port** — *which program on that machine*

Together they form a **socket**: `10.0.1.5:5432` means "the program listening on
port 5432 of the machine at 10.0.1.5".

## Why the layers exist

Rather than one enormous protocol, networking is split into layers, each solving
one problem and trusting the layer below.

```diagram
   your app  (HTTP: "GET /users")
      │
      ▼  needs a reliable ordered stream
   TCP       (ports, retransmission, ordering)
      │
      ▼  needs to find the machine
   IP        (addresses, routing between networks)
      │
      ▼  needs to reach the next hop
   Ethernet / WiFi   (MAC addresses, one physical link)
```

The value of the split: your app never thinks about cables, and IP never thinks
about retransmitting lost data. When you debug, you work **down** this stack —
and each layer you rule out eliminates a whole class of cause.

## What it is made of

### IP addresses and subnets

An IPv4 address is four numbers, `0–255` each: `10.0.1.5`.

Some ranges are **private** — usable inside your own network, never routable on
the internet:

| Range | Written as | Where you meet it |
|:---|:---|:---|
| `10.0.0.0`–`10.255.255.255` | `10.0.0.0/8` | Cloud VPCs, Kubernetes pods |
| `172.16.0.0`–`172.31.255.255` | `172.16.0.0/12` | Docker's default bridge |
| `192.168.0.0`–`192.168.255.255` | `192.168.0.0/16` | Home routers |
| `127.0.0.1` | `127.0.0.0/8` | Loopback — this machine only |

The `/8` and `/24` suffix is **CIDR notation**: how many leading bits are fixed
as the network, leaving the rest for hosts.

```diagram
   10.0.1.0/24
   └────┬───┘ └┬┘
        │      └── 24 bits fixed → 8 bits left → 256 addresses
        │          usable range 10.0.1.1 – 10.0.1.254
        │          (.0 is the network, .255 the broadcast)
        └───────── the network part

   /24 → 256 addresses      /16 → 65,536
   /28 → 16                 /8  → 16.7 million
   Rule of thumb: bigger number = smaller network.
```

### Ports

Ports separate programs on one machine. The ones worth memorising:

| Port | Service |
|:---|:---|
| 22 | SSH |
| 53 | DNS |
| 80 | HTTP |
| 443 | HTTPS |
| 3306 | MySQL |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 27017 | MongoDB |

Ports below 1024 require root to bind. This is why a container listening on 80
often runs its app on 8080 internally and maps the port instead.

### TCP versus UDP

| | TCP | UDP |
|:---|:---|:---|
| Guarantees | Ordered, no loss, no duplicates | None |
| Setup | 3-way handshake first | Just send |
| Speed | Slower | Faster |
| Used by | HTTP, SSH, databases | DNS, video, metrics |

**TCP** is a phone call: you connect, confirm the other side can hear you, then
talk. **UDP** is a postcard: you send it and hope.

### The TCP handshake

Worth knowing because it explains what "connection refused" means:

```diagram
   client                          server
     │ ── SYN ────────────────────→ │  "can we talk?"
     │ ←──────────── SYN-ACK ────── │  "yes, can you hear me?"
     │ ── ACK ────────────────────→ │  "yes"
   connected — data can now flow
```

Three messages, because two cannot prove **both** directions work.

## How to use it

### Is it listening?

```sh title="On the server itself"
# -l listening  -n numeric (no DNS lookups)  -t TCP  -p which process
sudo ss -lntp

# Is anything on port 5432 specifically?
sudo ss -lntp | grep 5432
```

Look at the **Local Address** column carefully:

| Shown as | Means |
|:---|:---|
| `0.0.0.0:5432` | Listening on **all** interfaces — reachable from outside |
| `127.0.0.1:5432` | Loopback **only** — nothing outside the machine can connect |
| `[::]:5432` | All interfaces, IPv6 |

:::danger Bound to 127.0.0.1 — the most common "why can't I connect?"
The service is running, the port is right, the firewall is open — and remote
connections still fail. Because it is listening on loopback only, it will only
ever accept connections from the same machine.

`ss -lntp` shows this immediately. The fix is in the service's own config:
PostgreSQL's `listen_addresses`, Redis's `bind`, or your app's bind address.

In a container this bites differently: an app bound to `127.0.0.1` inside a
container is unreachable even with `-p` mapping, because the port mapping
arrives on the container's external interface. Bind to `0.0.0.0` in containers.
:::

### Can I reach it?

Work through these in order — each one rules out a layer.

```sh
# 1. Does the name resolve? (rules out DNS)
getent hosts api.example.com

# 2. Does the machine respond at all? (rules out routing)
#    Note: many cloud hosts block ICMP, so a failed ping is not proof of a problem.
ping -c 3 10.0.1.5

# 3. Is the PORT open? This is the important one.
#    -z scan only, -v verbose, -w timeout in seconds
nc -zv 10.0.1.5 5432

# 4. Does the application actually answer?
curl -v https://api.example.com/health
```

Reading the result of step 3 is most of the skill:

| Result | Meaning | Next step |
|:---|:---|:---|
| `succeeded` / `open` | Something is listening and reachable | Problem is in the app or the protocol |
| `Connection refused` | Reached the machine, **nothing listening** on that port | Start the service, or check the port |
| **Timeout / hangs** | Packets are being **dropped** — a firewall | Check firewall rules and cloud security groups |

:::key Refused and timeout mean opposite things
**Connection refused** is a helpful answer. The machine received your packet and
actively replied "no program here". Networking and routing are fine — you have a
service or port problem.

**Timeout** means silence. Something is discarding packets without replying,
which is exactly what a firewall does. On a cloud VM this is usually a security
group or network ACL, not the server itself.

Getting these two backwards sends people to debug the wrong layer for hours.
:::

### Which route does traffic take?

```sh
ip addr              # this machine's addresses (replaces ifconfig)
ip route             # the routing table. "default via ..." is your gateway
traceroute 8.8.8.8   # each hop along the way
mtr 8.8.8.8          # traceroute + live loss stats. Better for intermittent issues
```

### Reading `curl -v`

```sh
curl -v https://api.example.com/health
```

| Line in the output | Tells you |
|:---|:---|
| `Trying 10.0.1.5:443...` | DNS resolved — to this address |
| `Connected to ...` | TCP succeeded. Address and port are correct |
| `TLS handshake` / certificate lines | HTTPS negotiation; cert problems appear here |
| `> GET /health` | What was sent |
| `< HTTP/1.1 200` | The status the server returned |

If it stops after "Trying", it is a firewall. If it stops at TLS, it is a
certificate. If you get a 5xx, the network is fine and the application is not.

## Firewalls: two layers on any cloud VM

This catches almost everyone once.

```diagram
   internet
      │
      ▼
   ① CLOUD firewall   ← AWS security group / Azure NSG / OCI security list
      │                 configured in the web console, NOT over SSH
      ▼
   ② HOST firewall    ← ufw or iptables, on the machine itself
      │
      ▼
   ③ the service      ← and it must be bound to 0.0.0.0, not 127.0.0.1
```

All three must allow the traffic. Opening only the host firewall and wondering
why the port is still closed is the single most common cloud networking mistake.

```sh
sudo ufw status                       # if ufw is installed
sudo iptables -L INPUT -n --line-numbers   # if it is not
```

## Key takeaways

- A connection is **address + port**. Get either wrong and nothing works.
- **Refused = nothing listening. Timeout = firewall.** Opposite problems.
- **`ss -lntp`** answers "is it listening, and on which interface?" — and
  `127.0.0.1` there means local-only.
- In containers, bind to **`0.0.0.0`**, never `127.0.0.1`.
- On a cloud VM there are **two firewalls**. The cloud one is not editable over
  SSH.
- Debug **downward**: name → route → port → application. Each step eliminates a
  layer.
