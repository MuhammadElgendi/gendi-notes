---
title: Cache Stampede
slug: cache-stampede
type: concept
domain: 12-system-design
tags: [caching, redis, scalability, failure-modes]
level: 4
status: stable
prerequisites: []
related: [high-latency-normal-cpu, rate-limiter]
updated: 2026-09-05
---

# Cache Stampede

> A cache does not fail when it is full — it fails when many clients miss the same key at the same instant.

## ① What is it?

A cache stampede (thundering herd) happens when a popular key expires and every
concurrent request for it misses simultaneously. All of them go to the origin at
once — and the origin was only ever sized for the *miss rate*, not the
*request rate*.

```diagram
   NORMAL                         AT THE MOMENT OF EXPIRY
   10,000 req/s                   10,000 req/s
        │                              │
   99.9% hit                      100% MISS (key gone)
        │                              │
        ▼                              ▼
   10 req/s to DB  ✓            10,000 req/s to DB  ✗ collapse
```

The cache was doing a 1000× reduction. When it stops for one key for a few
hundred milliseconds, the origin receives its entire design margin at once.

## ② Why does it exist?

Because TTL expiry is **synchronised**. The key was written once, so it expires
once, and every client that was being served from it becomes a cache miss in the
same instant. Nothing staggers them.

This is a property of caching itself, not of any particular cache product. It
happens with Redis, Memcached, an in-process map, and a CDN.

## ③ Mental Model

:::mental
A dam holding back a river. It works perfectly and everyone downstream forgets
the river's actual volume. The failure is not a leak — it is the dam
disappearing for one second. The downstream was never built for the river; it
was built for the trickle.

**Where it breaks down:** unlike a dam, the cache comes straight back. The damage
is done by the *transient*, which is why post-incident the cache looks completely
healthy and the origin looks like it "just fell over".
:::

## ④ Three failures people conflate

Distinguishing these matters, because the fixes are different.

| | Trigger | Fix |
|:---|:---|:---|
| **Stampede** (herd) | One hot key expires; concurrent misses | Single-flight, early recompute |
| **Penetration** | Requests for a key that **never** exists — often hostile | Cache the negative result; bloom filter |
| **Avalanche** | Many keys expire together (mass write, restart) | TTL jitter, warm-up |

Avalanche is the one that bites after a deploy: a cold cache from a Redis
restart means *every* key is a miss, not just one.

## ⑤ The Fixes, in order of what to reach for

### 1. Single-flight (request coalescing) — the default answer

One request recomputes; everyone else waits for that result.

```diagram
   100 concurrent misses on key K
              │
        ┌─────┴──────┐
        ▼            ▼
   first request   the other 99
   acquires lock   WAIT on the lock
        │            │
   recompute         │
   write cache       │
   release ─────────▶ all read the fresh value
        │
   1 origin call instead of 100
```

**Cost:** the 99 waiters pay the recompute latency. **Risk:** if the lock holder
dies you need a timeout, or everyone waits forever. Always set a lock TTL.

### 2. TTL jitter — one line, prevents avalanche

```
ttl = base_ttl + random(0, base_ttl * 0.1)
```

Keys written together no longer expire together. Nearly free; there is no reason
not to do this everywhere.

### 3. Probabilistic early recompute (XFetch)

Before the TTL expires, each reader independently rolls a die whose probability
rises as expiry approaches. One unlucky reader refreshes *early*, while the old
value is still being served.

**Why this is elegant:** no locks, no coordination, and no client ever waits —
the refresh happens while the cache still has a valid value to serve.

### 4. Serve stale while revalidating

Return the expired value immediately and refresh in the background. The best
user-visible latency of any option — but only legitimate if your correctness
requirements permit briefly stale data. That is a product decision, not an
engineering one. Say so out loud when you propose it.

## ⑥ What happens when the cache itself fails?

The question people forget until it happens.

```diagram
  Redis unavailable
        │
        ├─ fail OPEN  ──▶ every request goes to the origin
        │                 → correct answers, origin collapses
        │
        └─ fail CLOSED ──▶ requests error immediately
                          → origin survives, users see errors
```

Neither is right in general. What you must not do is choose accidentally — most
systems fail open by default and discover at 3am that the origin cannot survive
even a few seconds of full traffic.

The defensible middle: fail open **behind a concurrency limiter** on the origin.
The origin serves what it can and sheds the rest, so you degrade instead of
collapsing.

:::senior
**"Add Redis" is never a complete answer.** The questions that separate a senior
answer from a junior one:

- **Why Redis and not an in-process cache?** In-process is faster and has no
  network hop, but each replica has its own copy, its own TTLs, and N× the
  origin miss traffic. Redis is shared state — you take a network hop to get
  coherence across replicas.
- **What consistency does this introduce?** A cache is a second copy of the
  truth. You now have a staleness window and a possible read-your-own-write
  violation. Name the window explicitly.
- **What is the origin's real capacity?** If you cannot answer this, you cannot
  reason about any failure mode above. Load-test the origin *with the cache
  disabled* — this is the single most valuable thing you can do.
- **When should Redis NOT be used?** When the working set fits comfortably in
  each replica's memory and coherence does not matter (use in-process); when the
  data is write-heavy with few re-reads (the cache pays cost and returns
  nothing); when staleness is unacceptable and you would have to invalidate
  synchronously on every write anyway.
:::

## ⑦ Failure Modes

| What breaks | Signature | Note |
|:---|:---|:---|
| Hot-key stampede | Origin load spikes at TTL boundaries | Periodic, matching the TTL |
| Cold cache after restart | Total origin load immediately post-restart | Warm before taking traffic |
| Lock holder dies | Waiters hang for the lock TTL | Always bound the lock |
| Fail-open cascade | Cache blip → origin collapse → longer outage | The outage outlives the blip |
| Hot key on one shard | One Redis node saturated, others idle | Sharding does not help a single key |

## ⑧ Troubleshooting

```sh
# Hit rate is the leading indicator. It collapses BEFORE latency rises,
# which makes it the earliest signal you have.
redis-cli INFO stats | grep -E 'keyspace_(hits|misses)'

# Find a hot key. --hotkeys needs an LFU/LRU maxmemory-policy configured.
redis-cli --hotkeys

# Is a single key dominating traffic? Sample live commands briefly —
# MONITOR is expensive, never leave it running.
redis-cli --timeout 5 MONITOR | head -200

# Evictions mean the cache is under memory pressure and expiring keys
# early — which manufactures stampedes you did not schedule.
redis-cli INFO stats | grep evicted_keys
```

## ⑨ Common Mistakes

- **Sizing the origin for the cached load.** The cache is then load-bearing
  infrastructure, not an optimisation, and any blip is an outage.
- **Identical TTLs everywhere.** Guarantees synchronised expiry. Jitter costs
  one line.
- **A lock with no TTL.** Converts a stampede into a permanent hang.
- **Sharding to fix a hot key.** All requests for one key hash to one node.
  Sharding fixes aggregate capacity, never a single hot key — you need local
  replication or an in-process tier in front.
- **Never testing with the cache off.** You do not know your origin's capacity,
  so you cannot predict any of the above.

## ⑩ Interview Traps

:::trap
**"Your cache hit rate is 99%. How much origin traffic does losing the cache
create?"**

The intuitive answer — "1% becomes 100%, so 100×" — is right in magnitude and
wrong in kind. The point is that the origin has *never* served that load, so its
behaviour there is unknown and probably non-linear: connection pools exhaust,
queues build, and it will collapse well before 100× — likely at 5–10×.

The follow-up: *"So what would you do?"* Concurrency-limit the origin so it
degrades gracefully, and load-test it with the cache disabled so the number stops
being a guess.
:::

:::trap
**"Just increase the TTL to reduce stampedes."**

It reduces their *frequency* and increases their *severity* — a longer TTL means
more clients depending on that one key when it finally expires, and a larger
staleness window. Frequency is not the problem; synchronisation is. Fix the
synchronisation (jitter, single-flight, early recompute), not the interval.
:::

## ★ Key Takeaway

:::cloud
**1.** A stampede is a **synchronisation** failure, not a capacity failure.
**2.** Single-flight + TTL jitter handles most of it, and both are cheap.
**3.** Decide fail-open vs fail-closed **deliberately**, and put a concurrency
limit on the origin either way.
**4.** If you have never load-tested with the cache off, you do not know your
real capacity.
**5.** Sharding never fixes a hot key.
:::

---

**Version note:** the patterns here are cache-agnostic and stable. `--hotkeys`
requires an LFU or LRU `maxmemory-policy`; probabilistic early expiration is
described in the XFetch paper (Vattani et al., 2015) and is implemented in
several client libraries rather than in Redis itself.
