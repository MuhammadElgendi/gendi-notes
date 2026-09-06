---
title: Database Indexes
slug: database-indexes
type: concept
domain: 09-databases
tags: [databases, indexing, postgresql, performance, b-tree]
level: 3
status: stable
prerequisites: []
related: [high-latency-normal-cpu]
updated: 2026-09-05
---

# Database Indexes

> An index is a bet that reading is more common than writing — and like any bet, it can be placed badly.

## ① What is it?

An index is a **second, sorted copy** of some columns, kept alongside the table
and maintained on every write. Sorted order is what allows the database to find
rows without examining all of them.

Almost always a **B+tree**: a balanced tree with all data in the leaves and the
leaves linked together — which is why it serves both point lookups and range
scans well.

## ② Why does it exist?

```diagram
  WITHOUT INDEX                    WITH B+TREE INDEX
  scan every row                   descend the tree
  10,000,000 rows                  log₁₀₀(10,000,000) ≈ 3.5 levels
        │                                │
   O(n) — and it is                 ~4 page reads
   disk I/O, not CPU                     │
        │                           O(log n)
   seconds                          microseconds
```

The B+tree's fan-out is what makes this dramatic: with ~100 keys per page, three
levels index a million rows and four index a hundred million. **Real tables are
almost always 3–4 levels deep**, so a point lookup is a handful of page reads
regardless of table size.

:::mental
A book's index. Finding "photosynthesis" by reading every page is a table scan;
the index at the back is sorted, so you binary-search it and jump straight to the
page.

**Where it breaks down:** a book's index is printed once. A database index is
rewritten on **every insert, update and delete**. That maintenance cost is the
entire trade-off, and it is invisible on the read path where people evaluate it.
:::

## ③ The cost nobody accounts for

Every index makes writes slower and consumes space.

```diagram
  INSERT one row into a table with 5 indexes
        │
        ├──▶ write the row (heap)
        ├──▶ update index 1  ┐
        ├──▶ update index 2  │  each one is a tree descent
        ├──▶ update index 3  │  plus possible page splits
        ├──▶ update index 4  │
        └──▶ update index 5  ┘
       = 6 writes for 1 logical insert
```

:::senior
**Unused indexes are pure cost.** They slow every write, consume memory that
would otherwise cache useful pages, lengthen backups, and slow recovery. Auditing
for them is one of the highest-value, lowest-risk database tasks available.

```sql
-- PostgreSQL: indexes never used since the last stats reset.
-- Verify the counter has been accumulating long enough to be meaningful
-- before dropping anything, and never drop a UNIQUE index used as a
-- constraint (it is enforcing correctness, not speed).
SELECT relname AS table, indexrelname AS index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```
:::

## ④ Selectivity decides whether it helps at all

An index only pays off when it eliminates **most** of the table.

| Column | Distinct values | Selectivity | Index worth it? |
|:---|:---|:---|:---|
| `user_id` | 10M | Very high | Yes |
| `email` | 10M unique | Perfect | Yes |
| `status` | 4 values | Low | Usually not alone |
| `is_deleted` | 2 values | Terrible | No — unless *partial* |

Reading one million rows *via an index* is **slower** than a sequential scan,
because index access is random I/O while a scan is sequential. This is why the
planner correctly ignores your index on a low-selectivity column — it is not
being stubborn, it is being right.

**The exception — a partial index**, which is often the better tool:

```sql
-- Indexes only the rows you actually query. Tiny, and highly selective
-- even though "status" itself has almost no distinct values.
CREATE INDEX idx_orders_pending ON orders (created_at)
WHERE status = 'pending';
```

## ⑤ Composite indexes and the leftmost-prefix rule

Column **order** is the whole game.

```diagram
  INDEX ON (tenant_id, status, created_at)
  sorted first by tenant_id, then status, then created_at

  WHERE tenant_id = 5                                    ✓ uses it
  WHERE tenant_id = 5 AND status = 'open'                ✓ uses it
  WHERE tenant_id = 5 AND status = 'open' ORDER BY created_at  ✓ ideal
  WHERE status = 'open'                                  ✗ CANNOT use it
  WHERE created_at > now() - interval '1 day'            ✗ CANNOT use it
```

You can use a **left-anchored prefix** and nothing else — exactly like a phone
book sorted by (surname, forename) being useless for finding every "James".

**Ordering heuristic:** equality columns first, then the range or `ORDER BY`
column last. A range predicate stops the index being useful for columns to its
right.

## ⑥ When the planner ignores your index

The most common source of "I added an index and nothing happened".

| Cause | Example | Fix |
|:---|:---|:---|
| **Function on the column** | `WHERE lower(email) = $1` | Expression index on `lower(email)` |
| **Implicit type cast** | `varchar` column compared to an integer | Fix the parameter type |
| **Leading wildcard** | `WHERE name LIKE '%smith'` | Trigram index, or full-text search |
| **Low selectivity** | Query returns 40% of the table | Planner is right; a scan is cheaper |
| **Stale statistics** | Table just bulk-loaded | `ANALYZE table` |
| **`OR` across columns** | `WHERE a = 1 OR b = 2` | Two indexes + `UNION`, or a bitmap scan |

```sql
-- Never guess. ANALYZE runs the query and reports what actually happened.
-- Compare "rows=" (the planner's estimate) with "actual rows=" — a large
-- gap means bad statistics, and bad statistics mean bad plans.
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;
```

**Reading the output:** `Seq Scan` on a large table with a selective predicate is
the smell. `Index Scan` then a filter discarding most rows means the index is not
selective enough. `Index Only Scan` is the best case — see below.

## ⑦ Covering indexes and index-only scans

A B+tree leaf holds the indexed columns and a pointer to the row. Normally the
database must then fetch the row itself for any other column — random I/O, once
per row.

If every column the query needs is **in the index**, that second step disappears:

```sql
-- INCLUDE stores extra columns in the leaf without making them part of
-- the sort key. The query is answered from the index alone.
CREATE INDEX idx_orders_lookup ON orders (tenant_id, status) INCLUDE (total);
```

:::senior
**In PostgreSQL an index-only scan still consults the visibility map**, because
the index does not record whether a row version is visible to your transaction.
On a table with heavy recent writes the visibility map is stale and Postgres
falls back to heap fetches anyway — so an index-only scan that was fast in
staging can be slow in production purely because production has more churn.

`VACUUM` updates the visibility map. This is one of several reasons autovacuum
tuning is a performance topic, not just a housekeeping one.
:::

## ⑧ Failure Modes

| What breaks | Signature | Cause |
|:---|:---|:---|
| Writes slow after "optimisation" | Insert latency up, reads fine | Too many indexes |
| Index bloat | Size grows, performance decays | Dead tuples; `REINDEX CONCURRENTLY` |
| Plan flip | Fast for weeks, suddenly slow | Data distribution crossed a planner threshold |
| Lock during creation | Writes blocked, incident | `CREATE INDEX` without `CONCURRENTLY` |
| Index larger than the table | Storage surprise | Over-wide composite indexes |

:::failure
**`CREATE INDEX` takes an exclusive lock and blocks writes for the duration.**

On a large production table that is an outage. Use `CREATE INDEX CONCURRENTLY`:
it takes two passes, does not block writes, and takes longer — and it can leave
an **invalid index** behind if it fails, which you must drop and retry.

The related trap: `CONCURRENTLY` cannot run inside a transaction block, so most
migration frameworks reject it by default. Teams then quietly drop the keyword to
make the migration run — and cause the outage they were avoiding.
:::

## ⑨ Common Mistakes

- **Adding an index as a reflex.** First read the plan. The problem is often the
  query shape, not a missing index.
- **One index per column.** The planner rarely combines them well; one correctly
  ordered composite index usually beats three single-column ones.
- **Wrong column order** in a composite index — see ⑤.
- **Indexing a boolean.** Use a partial index instead.
- **Trusting a staging plan.** Plans depend on data distribution and statistics.
  A different data shape produces a different plan.

## ⑩ Interview Traps

:::trap
**"The query is slow. Would you add an index?"**

Answering "yes" immediately fails the question. It is testing whether you
diagnose or pattern-match.

Say: run `EXPLAIN ANALYZE` first. Is it actually a scan? How selective is the
predicate — if the query returns 30% of the table, an index makes it *slower*.
Is an index being skipped because of a function or a cast? And what is the write
volume, since every index taxes it?

Then the follow-up that scores: "and I'd create it `CONCURRENTLY`, because a
plain `CREATE INDEX` locks writes on a live table."
:::

:::trap
**"Why can adding an index make the database slower overall?"**

Three mechanisms, and naming more than one shows depth:
1. **Write amplification** — every insert/update maintains every index.
2. **Cache pressure** — indexes compete with table data for the buffer pool, so
   a large unused index evicts pages you actually need.
3. **Worse plans** — more candidate paths can lead the planner to a bad choice on
   skewed data.
:::

## ★ Key Takeaway

:::cloud
**1.** An index is a sorted copy maintained on **every write**. That cost is the
trade-off, and it is invisible on the read path.
**2.** Selectivity decides everything. Low-cardinality columns want a **partial**
index, not a plain one.
**3.** Composite indexes work left to right only. Equality columns first, range
last.
**4.** `EXPLAIN ANALYZE` before adding anything. Compare estimated to actual rows.
**5.** `CREATE INDEX CONCURRENTLY` on production, always.
:::

---

**Version note:** examples are PostgreSQL (`pg_stat_user_indexes`, `INCLUDE`
requires 11+, `REINDEX CONCURRENTLY` requires 12+). B+tree behaviour, selectivity
and the leftmost-prefix rule apply to MySQL/InnoDB equally, though InnoDB's
clustered primary key changes the secondary-index lookup path — worth a separate
note.
