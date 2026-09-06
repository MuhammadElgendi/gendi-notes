---
title: Terraform State
slug: terraform-state
type: concept
domain: 05-infrastructure-as-code
tags: [terraform, iac, state, locking]
level: 3
status: stable
prerequisites: []
related: [sli-slo-sla]
updated: 2026-09-05
---

# Terraform State

> State is Terraform's memory of what it created — and the only thing standing between a config change and an accidental deletion.

## ① What is it?

State is a JSON document mapping **resources in your configuration** to **real
objects at the provider**, storing the ID of each and a cached copy of its
attributes.

```diagram
   CONFIGURATION            STATE                     REALITY
   aws_instance.web   ──▶   id = i-0abc123      ──▶   the actual EC2 instance
   (what you want)          (what I made)             (what exists)
```

Terraform's entire job is diffing those three. Lose the middle column and it
cannot tell "create this" from "this already exists".

## ② Why does it exist?

There is no universal cloud API for "list everything *I* created". Providers can
list resources, but not which ones belong to this configuration, nor which config
block each corresponds to.

Without state, Terraform faces an unanswerable question:

```diagram
  config says: 1 instance named "web"
  AWS says:    47 instances exist
        │
        ▼
  Is one of them mine? Which? Did I create it, or did someone else?
  Should I create a new one, or adopt an existing one?
        │
        ▼
  Unanswerable. Hence state.
```

:::mental
State is a **receipt**. The config is your shopping list, reality is your
cupboard, and the receipt proves which items in the cupboard you bought on this
trip.

**Where it breaks down:** unlike a receipt, state is *authoritative*. Delete a
line from it and Terraform genuinely believes it never bought that item — and
will happily buy another.
:::

## ③ What state actually contains

| Contents | Why it matters |
|:---|:---|
| Resource IDs | The mapping. The whole point |
| Cached attribute values | Lets `plan` diff without querying everything |
| Resource dependencies | Determines destroy order — **not recoverable from config alone** |
| **Secrets in plaintext** | Any sensitive output or attribute. See below |
| Serial + lineage | Detects divergence between state files |

:::failure
**State contains secrets in plaintext. This is not a bug and it is not fixable
in Terraform.**

An RDS `password`, a generated private key, a `random_password` — all stored
unencrypted in the JSON. `sensitive = true` only hides values from *console
output*; it changes nothing in the state file.

Consequences to internalise:
- Never commit state to Git. A `.tfstate` in a repository is a credential leak,
  and it stays in history after deletion.
- The state backend must be encrypted at rest and access-controlled **as tightly
  as the secrets it contains**.
- Anyone with read access to state has the credentials of everything in it.
:::

## ④ Remote state and locking

Local state means one person can work, no history, and a laptop failure loses
your infrastructure's memory. Remote state fixes that — but the important part is
locking.

```diagram
  WITHOUT LOCKING                    WITH LOCKING
  Alice: apply ──┐                   Alice: apply → ACQUIRES LOCK
  Bob:   apply ──┤ same moment       Bob:   apply → waits / errors
                 ▼                          │
       both read the same state             ▼
       both write their own version   Alice finishes → releases
                 │                    Bob reads the UPDATED state
                 ▼
       LAST WRITE WINS — the other's
       resources are now orphaned:
       real, running, billing, and
       invisible to Terraform
```

Orphaned resources are the genuinely expensive failure: they exist and cost
money, but no configuration knows about them, so nobody finds them until an audit.

| Backend | Locking via |
|:---|:---|
| S3 | DynamoDB table (or S3 native locking, newer) |
| Azure Storage | Blob lease (automatic) |
| GCS | Native (automatic) |
| Terraform/HCP Cloud | Native (automatic) |

## ⑤ Drift

Drift is reality diverging from state — someone changed a security group in the
console, or an autoscaler altered a count.

```sh
# Refreshes state against reality and shows the difference WITHOUT
# proposing changes. The read-only way to ask "has anyone touched this?"
terraform plan -refresh-only

# Detect drift in CI. -detailed-exitcode returns 2 when a diff exists,
# which is what makes this scriptable as a scheduled check.
terraform plan -detailed-exitcode
```

:::senior
**`terraform plan` is a prediction, not a guarantee.**

Between plan and apply, anything can change: another engineer applies, an
autoscaler acts, a console edit lands. Terraform re-reads state at apply time,
but the plan you *reviewed* may no longer describe what will happen.

This is why `terraform apply` re-prompts rather than trusting the plan, and why
`-out=tfplan` for review-then-apply is worth the extra step in CI: the saved plan
is applied exactly, or it fails loudly.
:::

## ⑥ The dangerous operations

These edit state without touching infrastructure. They are the right tools, and
they are also how people cause outages.

```sh
# Adopt an existing resource into state. Non-destructive.
# The modern form uses an import block in config, which is reviewable in a PR —
# strongly preferred over the imperative command.
terraform import aws_instance.web i-0abc123

# FORGET a resource. It keeps running, keeps billing, and Terraform stops
# managing it. Use to hand a resource to another config — never to "fix" a
# plan you do not understand.
terraform state rm aws_instance.web

# Rename or move within state, e.g. after refactoring into a module.
# Prefer a `moved` block in config: reviewable, and applied automatically.
terraform state mv aws_instance.web module.web.aws_instance.this
```

:::trap
**Never edit `terraform.tfstate` by hand.**

It is tempting: it is JSON, and the fix looks like a two-line edit. But the
`serial` and `lineage` fields, the dependency graph, and provider-specific schema
versions all have to stay consistent. A hand edit that looks right can make
Terraform destroy and recreate a resource it should have left alone.

Use `terraform state` subcommands. They maintain the invariants. If you genuinely
must hand-edit, `terraform state pull` → edit → `terraform state push`, with a
backup, and expect to be wrong the first time.
:::

## ⑦ Blast radius — the design decision that matters most

**One state file = one blast radius.** Everything in a state can be destroyed by
one mistaken `apply`, and every apply locks everything in it.

```diagram
  MONOLITHIC STATE              SPLIT STATE
  ┌────────────────────┐        ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ network            │        │ network  │ │ data     │ │ apps     │
  │ database           │        │ (rare)   │ │ (rare)   │ │ (hourly) │
  │ kubernetes         │        └──────────┘ └──────────┘ └──────────┘
  │ 40 applications    │           ▲              ▲
  └────────────────────┘           └── remote_state / data sources ──┘
   · every apply locks all
   · one typo can destroy all      · small plans, small blast radius
   · plans take 10 minutes         · teams apply independently
```

Split along **rate of change** and **team ownership**, not along resource type.
Things that change hourly do not belong in the same state as a VPC that changes
twice a year.

The cost is real: cross-state references (`terraform_remote_state` or provider
data sources) add coupling, and a change spanning states needs ordering. That is
usually a better problem than a ten-minute plan nobody reads carefully.

## ⑧ Failure Modes

| What breaks | Consequence | Recovery |
|:---|:---|:---|
| State lost / deleted | Terraform wants to recreate everything | Restore from backend versioning; else re-import each resource |
| Concurrent apply, no lock | Orphaned resources, silently billing | Reconcile by hand — painful |
| State committed to Git | Credential leak in history | Rotate every secret in it |
| Hand-edited state | Unpredictable destroy/recreate | Restore from a previous version |
| Stale lock after a crash | All applies blocked | `terraform force-unlock <id>` — **verify nothing is running first** |

**Enable versioning on the state bucket before anything else.** It converts the
worst failure on this list into a five-minute restore.

## ⑨ Common Mistakes

- **`terraform state rm` to make a confusing plan go away.** The resource stays
  alive and unmanaged. You have hidden the problem and created a bill.
- **`force-unlock` without checking.** If an apply really is in flight, breaking
  the lock corrupts state.
- **One state for an entire environment.** Guarantees slow plans and a maximal
  blast radius.
- **Assuming `sensitive = true` protects state.** It only affects console output.
- **No state backups.** Bucket versioning is one setting.

## ⑩ Interview Traps

:::trap
**"Why does Terraform need state? Why not just query the cloud?"**

The instinct — "for performance" — is a real but secondary benefit.

The actual reason: **there is no way to determine ownership or identity from the
provider alone.** A cloud API can list instances; it cannot say which correspond
to which config blocks, or which this configuration is responsible for.

Then the point that shows depth: state also records the **dependency graph**,
which is not recoverable from the provider. Terraform needs it to destroy
resources in the correct order.
:::

:::trap
**"Someone deleted the state file. What now?"**

Wrong answer: "run `terraform apply` to recreate everything." That creates
*duplicates* alongside the resources that are still running.

Right answer, in order: (1) do not apply — stop; (2) restore from bucket
versioning, which is why you enabled it; (3) if there is no backup, `import`
each resource one at a time, verifying with `plan -refresh-only` until the plan
is empty; (4) afterwards, enable versioning and split the state so the next
occurrence is smaller.
:::

## ★ Key Takeaway

:::cloud
**1.** State is the mapping from config to real resources. Without it Terraform
cannot tell "create" from "already exists".
**2.** State holds **plaintext secrets**. Encrypt the backend, never commit it,
treat read access as credential access.
**3.** Locking prevents orphaned resources — the most expensive Terraform
failure, because they bill silently.
**4.** One state = one blast radius. Split by rate of change and ownership.
**5.** Never hand-edit state. Enable bucket versioning today.
:::

---

**Version note:** `moved` blocks require Terraform 1.1+, `import` blocks 1.5+.
S3 native state locking is recent; DynamoDB remains the widely deployed approach.
Behaviour is broadly the same in OpenTofu.
