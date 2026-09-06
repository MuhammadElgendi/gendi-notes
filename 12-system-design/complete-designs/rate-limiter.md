---
title: Design — Distributed Rate Limiter
slug: rate-limiter
type: system-design
domain: 12-system-design
tags: [system-design, rate-limiting, distributed-systems, redis]
level: 4
status: stable
prerequisites: [cache-stampede]
related: [high-latency-normal-cpu]
updated: 2026-09-05
---

# Design — Distributed Rate Limiter

> The hard part is not counting requests — it is that the counter is shared, and every read of it is already out of date.

## ① Requirements

**Functional**

- Limit requests per API key: e.g. 1,000 per minute.
- Support multiple tiers (free / pro / enterprise) and per-endpoint overrides.
- Reject over-limit requests with `429` and a `Retry-After` header.

**Non-functional** — these shape the design far more than the functional list.

| Property | Target | Why this number |
|:---|:---|:---|
| Added latency | **p99 < 5ms** | It is on every request; anything more taxes the whole API |
| Accuracy | ±1% at the boundary | Billing does not depend on it; abuse prevention does not need perfection |
| Availability | Higher than the API itself | A limiter that fails takes the API with it |
| Scale | 100k req/s, 10M keys | Sets the storage and hot-key strategy |

**Out of scope:** billing/quota accounting (needs exactness and durability that
a rate limiter deliberately trades away).

## ② Back-of-envelope

```diagram
  100,000 req/s  ×  1 counter read+write each   =  200,000 Redis ops/s
       │
       ├── one Redis node handles ~100k ops/s   →  MUST shard
       │
  10M keys × ~64 bytes  =  640 MB               →  fits in memory comfortably
       │
  Hot key: one enterprise customer at 20k req/s →  20% of ALL traffic on ONE shard
                                                    ◀── this is the real problem
```

The arithmetic immediately surfaces the design's actual difficulty: **key
distribution, not total volume**.

## ③ Algorithm choice

This decision determines everything downstream, so make it first.

| Algorithm | Memory/key | Burst behaviour | Boundary accuracy |
|:---|:---|:---|:---|
| **Fixed window** | 1 counter | Allows 2× at the boundary | Poor |
| **Sliding log** | One entry **per request** | Exact | Perfect |
| **Sliding window counter** | 2 counters | Smooth | ~Exact (approximation) |
| **Token bucket** | 2 fields | **Intentional** bursts | Good |

:::trap
**The fixed-window boundary bug — the most-asked follow-up in this design.**

```diagram
  limit = 1000/min

  10:00:59  ─── 1000 requests ───▶  window "10:00" full, all allowed
  10:01:00  ─── 1000 requests ───▶  window "10:01" is fresh, all allowed

  Result: 2000 requests in a 2-second span, and every one was "within limit".
```

A candidate who proposes fixed window without naming this has not thought it
through. It is not a subtle edge case — an attacker finds it immediately.
:::

**Choice: token bucket**, with sliding-window counter as the alternative.

Token bucket wins because bursts are a *feature* for an API: a client that has
been idle should be allowed a short burst. It also stores only two fields
(`tokens`, `last_refill`) and needs no background job — tokens are computed
lazily from elapsed time on each read.

## ④ Architecture

```diagram
   client
     │
     ▼
  ┌─────────────────┐   ① check local in-process bucket (hot keys only)
  │  API gateway    │──────────────────────────────┐
  │  (N instances)  │                              │ hit → decide locally, 0 network
  └────────┬────────┘                              │
           │ ② miss / not hot                      │
           ▼                                       │
  ┌─────────────────┐                              │
  │  Redis cluster  │  atomic Lua: refill + consume│
  │  sharded by key │                              │
  └────────┬────────┘                              │
           │ ③ Redis unreachable                   │
           ▼                                       ▼
  ┌─────────────────────────────────────────────────┐
  │ FALLBACK: local limit at (global ÷ instances)   │
  │ degraded but bounded — never unlimited          │
  └─────────────────────────────────────────────────┘
```

## ⑤ Why each component exists

| Component | Exists because | Remove it and… |
|:---|:---|:---|
| Redis | Counters must be shared across gateway instances | Each instance limits independently → N× the intended limit |
| **Lua script** | Read-then-write is not atomic across a network | Two concurrent requests both read 1 token, both allow → over-limit |
| Local tier | A hot key would saturate one shard | One customer's traffic bottlenecks a single Redis node |
| Fallback | Redis will be unavailable at some point | The limiter becomes a hard dependency and a SPOF |

:::senior
**Atomicity is the whole design, and it is where most candidates fail.**

`GET` then `SET` from the application is a race. Between the two, another
gateway instance reads the same value. Both see one token; both allow. Under
concurrency this is not rare — it is the common case.

The counter must be read and mutated in **one atomic server-side operation** — a
Lua script in Redis, which executes atomically. This single point separates a
design that works from one that merely looks right on a whiteboard.
:::

```lua
-- Atomic token bucket. Returns 1 = allow, 0 = deny.
-- Runs entirely inside Redis: no window exists for a concurrent request
-- to observe a partially-updated bucket.
local tokens_key, ts_key = KEYS[1], KEYS[2]
local rate, capacity, now, requested = tonumber(ARGV[1]), tonumber(ARGV[2]),
                                       tonumber(ARGV[3]), tonumber(ARGV[4])

local tokens = tonumber(redis.call("get", tokens_key)) or capacity
local last   = tonumber(redis.call("get", ts_key))     or now

-- Lazy refill: tokens accrue with elapsed time, so no background job is needed.
tokens = math.min(capacity, tokens + (now - last) * rate)

local allowed = tokens >= requested
if allowed then tokens = tokens - requested end

-- TTL bounds memory: idle keys evict themselves, so 10M keys never all coexist.
local ttl = math.ceil(capacity / rate) * 2
redis.call("setex", tokens_key, ttl, tokens)
redis.call("setex", ts_key,     ttl, now)
return allowed and 1 or 0
```

Note `now` is passed **in** rather than read inside the script — Redis scripts
must be deterministic for replication, and the gateway's clock is the one that
matters for the caller.

## ⑥ Failure handling

| Failure | Behaviour | Why |
|:---|:---|:---|
| Redis shard down | Fall back to local limit ÷ N | Degrade, never fail open to unlimited |
| Redis slow (>5ms) | Timeout → local fallback | The limiter must never dominate request latency |
| Gateway instance dies | Its local buckets vanish | Acceptable: bounded over-admission for one window |
| Clock skew | Bounded by NTP | Skew shifts window edges, does not break counting |

:::failure
**Fail-open and fail-closed are both wrong as a blanket policy.**

Fail **open** on a Redis outage means unlimited traffic reaches the origin — the
limiter's absence becomes an outage of everything behind it.
Fail **closed** means a Redis blip becomes a total API outage, which is worse
than the abuse you were preventing.

The defensible answer is a **local fallback**: each gateway instance enforces
`global_limit / instance_count` from its own memory. Imprecise under uneven load
balancing, but bounded — and bounded is the property that matters. Say this out
loud in an interview; "we'd fail open" is a red flag.
:::

## ⑦ The hot-key problem

From ②: one enterprise customer can put 20% of all traffic on a single shard.
Sharding by key does not help — that key hashes to exactly one node.

**Solution: a two-tier limiter.**

```diagram
  Per-instance local bucket  ──▶  holds a LEASE of the global budget
        │                          e.g. instance takes 100 tokens at a time
        │  spends locally, zero network
        ▼
  Redis  ◀── contacted only when the lease is exhausted
             traffic to Redis drops by the lease size
```

The trade-off, stated plainly: an instance holding an unspent lease when it dies
loses those tokens. You accept slight under-admission to remove the hot shard.
This is the same reasoning as batched ID allocation.

## ⑧ Observability

Four signals, and one of them is not obvious:

- `rate_limit_decisions_total{decision}` — allow vs deny rates.
- `rate_limit_latency_seconds` — the limiter's own p99. It is on every request.
- **`rate_limit_fallback_active`** — are we running degraded? Without this, a
  Redis outage looks like "the limits got loose" and nobody knows why.
- `rate_limit_redis_errors_total` — leading indicator for the above.

**Page on:** fallback active for more than a few minutes. **Do not page on:**
deny rate — that is the system working.

## ⑨ Trade-offs

| Decision | Chose | Gave up | Revisit when |
|:---|:---|:---|:---|
| Token bucket | Bursts allowed, tiny state | Exact boundary enforcement | A contract mandates a hard ceiling |
| Redis + Lua | Atomicity, simplicity | A network hop on the hot path | Latency budget tightens below 2ms |
| Local fallback | Availability | Precision during an outage | Over-admission becomes costly |
| Lease/two-tier | Removes hot shards | Tokens lost on instance death | Only when a hot key actually appears |
| TTL eviction | Bounded memory | Idle keys reset to full | Never — this is the right call |

:::senior
**What this design is bad at.** It is approximate by construction. Do not reuse
it for anything requiring exactness — metered billing, licence seat counts,
inventory decrement. Those need a transactional store and durability guarantees
that a rate limiter deliberately trades away for latency.

Being able to name where your own design must not be used is the difference
between a senior and a staff answer.
:::

## ★ Key Takeaway

:::cloud
**1.** Atomicity is the design. Read-then-write over a network is a race, and
under concurrency it is the common case.
**2.** Fixed windows allow 2× at the boundary. Know it before you are asked.
**3.** Never fail open to unlimited. Fall back to a **bounded** local limit.
**4.** Sharding does not fix a hot key — leases do.
**5.** A rate limiter is deliberately approximate. Never use it for billing.
:::
