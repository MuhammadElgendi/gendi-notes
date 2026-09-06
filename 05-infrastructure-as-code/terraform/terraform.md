---
title: Terraform
slug: terraform
type: guide
domain: 05-infrastructure-as-code
tags: [terraform, iac, infrastructure]
keywords: [hcl, state, plan, apply, provider, module, variable, output, backend, drift, opentofu]
level: 2
status: stable
prerequisites: []
related: [ci-cd, kubernetes-basics]
updated: 2026-09-06
---

# Terraform

> You describe the infrastructure you want in files; Terraform works out the difference from what exists and makes only that change.

## What is it?

Terraform creates and manages cloud infrastructure from code. You write what you
want — a server, a database, a network — and Terraform calls the cloud provider's
API to make reality match.

```diagram
   your .tf files          Terraform            the cloud
   ──────────────          ─────────            ─────────
   "1 server,        →   compare desired   →   creates / changes
    2GB, in eu-west"      vs actual              only the difference
```

## Why it exists

Clicking through a cloud console works once. Then: nobody knows what was
changed, staging does not match production, and rebuilding after an outage means
remembering forty settings.

| Console clicking | Terraform |
|:---|:---|
| No record of what was done | The files *are* the record, in Git |
| Environments drift apart | Same code, different variables |
| Rebuild = remember everything | `terraform apply` |
| Review = "trust me" | A pull request with a diff |

## What it is made of

| Piece | What it is |
|:---|:---|
| **`.tf` files** | Your desired infrastructure, written in HCL |
| **Provider** | The plugin that talks to AWS / Azure / GCP |
| **Resource** | One thing to manage — a VM, a bucket, a DNS record |
| **Variable** | An input, so the same code works for dev and prod |
| **Output** | A value to display or pass to another module |
| **Module** | A reusable group of resources |
| **State** | Terraform's record of what it created. **The critical piece** |

### State is the part to understand

```diagram
   YOUR CODE               STATE                REALITY
   ─────────               ─────                ───────
   aws_instance.web   →   id = i-0abc123   →   the actual EC2 instance
   (what you want)        (what I made)        (what exists)
```

Terraform's whole job is diffing those three columns. There is no cloud API for
"list everything *I* created" — so without state, Terraform cannot tell "create
this" from "this already exists".

:::danger State contains secrets in plaintext, and it is not fixable
A generated database password, a private key, any sensitive attribute — stored
unencrypted in the state JSON. `sensitive = true` only hides values from console
*output*; it changes nothing in the file.

Therefore:
- **Never commit state to Git.** It is a credential leak, and it stays in
  history after deletion.
- The state backend must be **encrypted and access-controlled as tightly as the
  secrets inside it**.
- Anyone who can read state has the credentials of everything in it.
:::

## How to use it

### A first configuration

```hcl title="main.tf"
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"        # allow 5.x, not 6.0
    }
  }

  # Remote state: shared, versioned, and locked so two people cannot
  # apply at the same time. Set this up before your second engineer.
  backend "s3" {
    bucket         = "my-tf-state"
    key            = "prod/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "tf-locks"      # the lock table
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "instance_type" {
  type        = string
  default     = "t3.micro"
  description = "Size of the web server"
}

resource "aws_instance" "web" {
  ami           = "ami-0abcdef1234567890"
  instance_type = var.instance_type

  tags = {
    Name      = "web-server"
    ManagedBy = "terraform"      # so humans know not to edit it by hand
  }
}

output "public_ip" {
  value = aws_instance.web.public_ip
}
```

### The workflow

```sh
terraform init          # download providers, configure the backend. Run once per checkout
terraform fmt           # format the files
terraform validate      # syntax and type checking. No cloud calls
terraform plan          # WHAT WOULD CHANGE. Always read this
terraform apply         # make the change (asks for confirmation)
terraform destroy       # tear it all down
```

### Reading a plan — the most important skill

```text
  # aws_instance.web will be updated in-place
  ~ resource "aws_instance" "web" {
      ~ instance_type = "t3.micro" -> "t3.small"
    }

Plan: 0 to add, 1 to change, 0 to destroy.
```

| Symbol | Meaning |
|:---|:---|
| `+` | Create |
| `~` | Update in place — no downtime |
| `-` | **Destroy** |
| `-/+` | **Destroy then recreate** — the dangerous one |

:::danger Read the summary line, every single time
`Plan: 0 to add, 1 to change, 0 to destroy` is fine.
`Plan: 1 to add, 0 to change, 1 to destroy` on a database is an outage.

`-/+` means the resource **cannot** be changed in place, so Terraform will
delete and recreate it. On an EC2 instance that is a rebuild. On an RDS database
that is data loss.

Terraform tells you exactly what it will do. Almost every Terraform disaster is
someone typing `yes` without reading. When you see `-/+` on anything stateful,
stop and work out why.
:::

### Plan then apply, in CI

```sh
terraform plan -out=tfplan      # save the exact plan
# review it, get approval
terraform apply tfplan          # apply EXACTLY that plan, no re-prompt
```

Without `-out`, the plan you reviewed and the change that gets applied are two
separate calculations — and the world may have changed between them.

### Variables per environment

```hcl title="variables.tf"
variable "instance_type" { type = string }
variable "replica_count" { type = number, default = 2 }
```

```hcl title="prod.tfvars"
instance_type = "t3.large"
replica_count = 5
```

```sh
terraform apply -var-file=prod.tfvars
```

Same code, different inputs. This is how one configuration serves dev, staging
and production without copy-paste.

### Modules

```hcl
module "web_cluster" {
  source = "./modules/web-cluster"      # or a registry / Git URL

  environment   = "production"
  instance_type = "t3.large"
  replicas      = 5
}
```

Start writing modules when you copy a block for the third time — not before.
Premature modules are harder to read than the duplication they replace.

## State operations to know

```sh
terraform state list                    # everything Terraform manages
terraform state show aws_instance.web    # one resource in detail

# Adopt an existing resource created outside Terraform. Non-destructive.
# Prefer an `import` block in config (Terraform 1.5+) — it is reviewable in a PR.
terraform import aws_instance.web i-0abc123

# FORGET a resource. It keeps running and keeps billing; Terraform stops
# managing it. For handing a resource to another configuration.
terraform state rm aws_instance.web
```

:::warn `terraform state rm` is not a way to fix a confusing plan
It removes the resource from Terraform's memory. The resource keeps existing,
keeps costing money, and is now managed by nobody.

If a plan is confusing, understand it. Using `state rm` to make it go away
converts a question into an untracked, billing resource that nobody will find
until an audit.
:::

### Drift

Someone changed something in the console:

```sh
terraform plan -refresh-only     # show differences without proposing changes
terraform plan -detailed-exitcode  # exit 2 if there is a diff — scriptable in CI
```

A scheduled drift check is one of the highest-value CI jobs you can add.

## Blast radius: split your state

**One state file = one blast radius.** Everything in it can be destroyed by one
mistaken apply, and every apply locks all of it.

```diagram
   ONE BIG STATE                  SPLIT BY RATE OF CHANGE
   ┌─────────────────┐            ┌────────┐ ┌────────┐ ┌────────┐
   │ network         │            │ network│ │  data  │ │  apps  │
   │ database        │            │ (rare) │ │ (rare) │ │(hourly)│
   │ 40 applications │            └────────┘ └────────┘ └────────┘
   └─────────────────┘
   · 10-minute plans              · small, fast plans
   · one typo destroys all        · small blast radius
   · every apply locks everything · teams work independently
```

Split by **how often things change** and **who owns them**, not by resource
type. A VPC that changes twice a year does not belong in the same state as
applications that deploy hourly.

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| `Error acquiring the state lock` | Someone is applying, or a crashed run | Wait; `force-unlock <id>` only after verifying |
| Plan wants to recreate everything | Wrong backend/workspace — it sees empty state | Check `terraform init` and the state key |
| `Resource already exists` | Created outside Terraform | `import` it |
| Plan is never empty | A provider computes a value each run | Often benign; `lifecycle { ignore_changes = [...] }` |
| State file lost | Deleted, or bucket versioning off | Restore from versioning; else re-import each resource |
| Two engineers overwrite each other | No state locking | Add the lock table. This is why locking exists |

:::key Enable bucket versioning before your first apply
It is one setting, and it turns "we lost the state file" from a multi-day
re-import into a five-minute restore.

Do it now, not after you need it.
:::

## Key takeaways

- **Code → plan → apply.** Read the plan every time.
- **`-/+` means destroy and recreate.** On a database that is data loss.
- **State maps your code to real resources**, holds **plaintext secrets**, and
  must never be committed.
- **Remote state with locking** from the moment a second person is involved.
- **One state = one blast radius.** Split by rate of change.
- **`state rm` does not delete the resource** — it abandons it, still billing.
- **Bucket versioning today.** It is the difference between an inconvenience and
  a disaster.
