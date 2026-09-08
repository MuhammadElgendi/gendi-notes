---
title: Terraform
slug: terraform
type: guide
domain: 05-infrastructure-as-code
tags: [terraform, iac, infrastructure]
keywords: [hcl, state, plan, apply, provider, module, variable, output, backend,
           drift, opentofu, import, state rm, lock, blast radius, tfvars,
           تيرافورم, بنية تحتية, حالة, ستيت]
level: 2
status: stable
prerequisites: []
related: [ci-cd, kubernetes-basics, devops-interview-questions]
updated: 2026-09-08
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

:::ar بالمصري · الـ State هي الحاجة اللي لازم تفهمها
تيرافورم كل شغلته إنه يقارن **تلات أعمدة**:

```diagram
   الكود بتاعك          الـ STATE            الواقع
   ───────────          ─────────            ──────
   aws_instance.web  →  id = i-0abc123  →   السيرفر الحقيقي
   (إنت عايز إيه)       (أنا عملت إيه)      (الموجود فعلاً)
```

**وليه الـ state موجودة من الأصل؟** سؤال ممتاز، والإجابة عملية:

**مفيش API في أي كلاود بيقولك «اعرضلي كل حاجة *أنا* عملتها».** لو سألت
AWS «هاتلي السيرفرات»، هيجيبلك كل السيرفرات — بتاعتك وبتاعة غيرك واللي
اتعمل بالإيد.

**فمن غير الـ state، تيرافورم مش قادر يفرّق بين:**

- «اعمل السيرفر ده» ← عشان مش موجود
- «السيرفر ده موجود خلاص» ← عشان أنا عملته قبل كده

فهو بيكتب في ملف: «أنا عملت `aws_instance.web` وهو الـ `i-0abc123`».
والملف ده هو الـ state.

:::danger والـ state فيها الأسرار **مكتوبة صريح**، ومفيش حل لده
دي أخطر حقيقة في تيرافورم، وناس كتير مش عارفينها.

باسورد داتابيز اتولّد تلقائياً؟ مفتاح خاص؟ أي attribute حساس؟
**كلهم مكتوبين في ملف الـ JSON من غير أي تشفير.**

**و `sensitive = true` مش بتحل المشكلة!** هي بس بتخبّي القيمة من
**المخرجات على الشاشة**. الملف زي ما هو.

**وعلى كده، تلات قواعد:**

1. **عمرك ما تعمل commit للـ state في جيت.** ده تسريب أسرار، **وبيفضل
   في التاريخ بعد ما تمسحه**.
2. **الـ backend لازم يكون مشفّر وصلاحياته مضبوطة زي الأسرار اللي جواه
   بالظبط.** مش أقل.
3. **أي حد يقدر يقرا الـ state، عنده صلاحيات كل حاجة فيها.** فحد
   عنده read على البكت، ده عنده باسوردات الداتابيزات كلها.

ولو حد سألك في انترفيو «إزاي نأمّن أسرار تيرافورم؟» — الإجابة الصح إنك
**تقلّل الأسرار اللي تيرافورم بيولّدها من الأصل**، وتستخدم secret
manager وتشاور عليه، بدل إنك تحاول تشفّر الـ state.
:::
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

:::ar بالمصري · قراءة الـ plan هي أهم مهارة في تيرافورم كله
الـ `plan` بيقولك **بالظبط** هو هيعمل إيه، **قبل** ما يعمله. وأربع رموز
بس محتاج تعرفهم:

| الرمز | معناه | خطر؟ |
|:---|:---|:---|
| `+` | بيعمل حاجة جديدة | عادي |
| `~` | بيعدّل في مكانه — **من غير انقطاع** | عادي |
| `-` | **بيمسح** | **خد بالك** |
| `-/+` | **بيمسح ويعمل من الأول** | **دي الخطيرة** |

**والـ `-/+` هي اللي لازم توقّفك.**

معناها إن تيرافورم **مش قادر** يعدّل الحاجة دي في مكانها، فهو هيمسحها
ويعمل واحدة جديدة.

```diagram
   -/+ على سيرفر              →  السيرفر بيتعمل من الأول
                                  (توقّف، بس الداتا في مكان تاني)

   -/+ على داتابيز RDS        →  **الداتا بتضيع**
                                  (وده مش استعارة)

   -/+ على volume             →  **الداتا بتضيع**
```

:::danger اقرا سطر الملخص. **كل مرة. من غير استثناء.**
```text
Plan: 0 to add, 1 to change, 0 to destroy.     ← تمام
Plan: 1 to add, 0 to change, 1 to destroy.     ← على داتابيز؟ ده انقطاع
```

**تقريباً كل كارثة تيرافورم في التاريخ سببها حد كتب `yes` من غير ما
يقرا.** مش أكتر ولا أقل.

وتيرافورم **مش بيخبّي حاجة** — هو كتبلك بالظبط هيعمل إيه، وإنت اللي
دوست.

**فالقاعدة:** أول ما تشوف `-/+` على أي حاجة فيها **داتا**، **قف**، واعرف
**ليه**. غالباً هتلاقي attribute صغير مالوش لازمة هو اللي مجبر تيرافورم
على ده، وتقدر تغيّره أو تحطه في `lifecycle { ignore_changes }`.

**وفي الـ CI، اعمل كده:**

```sh
terraform plan -out=tfplan      # احفظ الخطة **بالظبط**
# راجعها، خُد موافقة
terraform apply tfplan          # طبّق **الخطة دي هي** من غير حساب جديد
```

**وليه ده مهم؟** عشان من غير `-out`، الخطة اللي راجعتها والتغيير اللي
بيتطبّق **حسابين مختلفين** — والدنيا ممكن تكون اتغيرت بينهم.
:::
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

:::ar
تلات أوامر على الـ state لازم تعرفهم، **وواحد منهم خطر**:

```sh
terraform state list                     # كل حاجة تيرافورم بيديرها
terraform state show aws_instance.web    # تفاصيل مورد واحد

terraform import aws_instance.web i-0abc123   # يتبنّى مورد موجود
terraform state rm aws_instance.web           # ← الخطير
```

**الـ `import`** بيقول لتيرافورم: «فيه حاجة موجودة، خُدها تحت إدارتك».
مش بيمسح ولا بيغيّر حاجة، فهو **آمن**. والأفضل تستخدم `import` block
في الكود (تيرافورم ١.٥+) عشان تبقى مراجَعة في PR.

:::danger و `state rm` **مش** طريقة تصلّح بيها plan محيّر
دي الغلطة اللي المُحاورين بيدوّروا عليها في الانترفيوهات.

`terraform state rm` **مش بيمسح المورد**. هو بيمسح **معرفة تيرافورم**
بالمورد.

```diagram
   قبل:   الكود ←→ الـ state ←→ السيرفر الحقيقي (تيرافورم بيديره)

   بعد state rm:
          الكود      الـ state       السيرفر الحقيقي
                     (فاضية)         │
                                     ├── لسه شغّال
                                     ├── لسه بياكل فلوس
                                     └── **ومحدش بيديره خلاص**
```

يعني إنت عملت **مورد يتيم**: شغّال، وبيتحاسب عليه، ومش في أي كود، ومحدش
هيلاقيه غير في مراجعة حسابات بعد سنة.

**فلو الـ plan محيّر، افهمه.** إنك تستخدم `state rm` عشان الحيرة تختفي،
ده **بيحوّل سؤال لمشكلة مخفية**.

**استخدامها الشرعي الوحيد:** إنك بتنقل مورد من state لـ state تانية
(مع `import` في الناحية التانية).
:::
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

:::ar بالمصري · دائرة الانفجار — قسّم الـ state
**state واحدة = دائرة انفجار واحدة.** كل حاجة جواها ممكن تتدمّر بـ apply
واحد غلط، وكل apply بيقفل عليها كلها.

```diagram
   STATE واحدة كبيرة                مقسّمة على معدّل التغيير
   ┌─────────────────┐              ┌────────┐ ┌────────┐ ┌────────┐
   │ الشبكة          │              │ الشبكة │ │ الداتا │ │ التطبيقات│
   │ الداتابيز       │              │ (نادر) │ │ (نادر) │ │ (كل ساعة)│
   │ ٤٠ تطبيق        │              └────────┘ └────────┘ └────────┘
   └─────────────────┘
   · plan بياخد ١٠ دقايق            · plans صغيرة وسريعة
   · غلطة واحدة تدمّر الكل           · دائرة انفجار صغيرة
   · كل apply يقفل كل حاجة           · الفرق بتشتغل مستقلة
```

**والتقسيم بيبقى على أساس إيه؟** حاجتين:

1. **معدّل التغيير** — الحاجة اللي بتتغير كل ساعة مش مع اللي بتتغير
   مرة في السنة.
2. **مين المسؤول** — كل فريق ياخد الـ state بتاعته.

**ومش** على أساس نوع المورد. يعني متقولش «state للسيرفرات و state
للشبكات» — قول «state للأساسيات النادرة، و state للتطبيقات السريعة».

**وليه ده مهم عملياً؟** لأن VPC بتتغير مرتين في السنة **مالهاش لازمة**
تكون في نفس الـ state بتاع تطبيقات بتتنشر كل ساعة:

- كل ديبلوي تطبيق بيقفل الشبكة كمان
- الـ plan بيقرأ ٤٠٠ مورد عشان يغيّر واحد
- وغلطة في التطبيق ممكن توصل للشبكة
:::

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

:::ar
**فعّل versioning على البكت قبل أول `apply` في حياتك.**

ده **إعداد واحد**، وبيحوّل «إحنا ضيّعنا ملف الـ state» من كارثة تاخد
أيام (إنك تعمل `import` لكل مورد بإيدك، واحد واحد) لـ **استعادة في
٥ دقايق**.

**اعملها دلوقتي، مش بعد ما تحتاجها** — عشان لما تحتاجها هتكون فات الوقت.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is Terraform state, why does it exist, and what happens if you lose it?
State is Terraform's record mapping each resource in your **code** to the
real object it created in the cloud (`aws_instance.web` → `i-0abc123`).

**Why it must exist:** no cloud API can answer "list everything *Terraform*
created". Without that mapping, Terraform cannot distinguish "create this"
from "this already exists", so every plan would propose recreating your
entire estate.

**If you lose it:**

| Available | Recovery |
|:---|:---|
| Bucket versioning on | Restore the previous version. Minutes |
| A local `.tfstate.backup` | Restore it; may be slightly stale |
| Nothing | `terraform import` every resource by hand — days, and error-prone |

The real answer to the last row is that it should never happen: remote
backend, encryption, **versioning**, and locking, configured before the first
apply.

:::key The follow-up that catches people
"Can you just delete the state and re-apply?" **No** — Terraform would see an
empty state, propose creating everything, and you would end up with duplicate
infrastructure or a failed apply on name collisions. And on stateful
resources, an `apply` against empty state is how people destroy production
databases.
:::

:::ar
الـ state هي سجل تيرافورم اللي بيربط كل مورد في **الكود** بالحاجة الحقيقية
اللي عملها في الكلاود (`aws_instance.web` ← `i-0abc123`).

**وليه لازم تكون موجودة؟** عشان **مفيش API في أي كلاود** بيجاوب على سؤال
«اعرضلي كل حاجة *تيرافورم* عملها».

فمن غير الربط ده، تيرافورم مش قادر يفرّق بين «اعمل ده» و «ده موجود خلاص» —
وكل `plan` كان هيقترح إنه يعمل **كل حاجة عندك من الأول**.

**ولو ضاعت؟**

| المتاح | الاستعادة |
|:---|:---|
| versioning مفعّل على البكت | استرجع النسخة السابقة. **دقايق** |
| ملف `.tfstate.backup` محلي | استرجعه، ممكن يكون قديم شوية |
| **مفيش حاجة** | `import` لكل مورد بإيدك — **أيام**، ومعرّض للغلط |

**والإجابة الحقيقية للسطر الأخير:** إنها **المفروض ما تحصلش أصلاً** —
backend بعيد، ومشفّر، **وversioning**، ولوك، **كلهم مظبوطين قبل أول
`apply`**.

**والسؤال اللي بيوقّع الناس بعده:**

«ما نمسح الـ state ونعمل apply من الأول؟»

**لأ خالص.** تيرافورم هيشوف state فاضية، هيقترح يعمل **كل حاجة**، وإنت
هتلاقي نفسك يا إما بنية تحتية **مكرّرة**، يا إما `apply` فاشل بسبب
تعارض أسماء.

**وعلى الموارد اللي فيها داتا، الـ `apply` على state فاضية هو بالظبط
إزاي الناس بتدمّر داتابيزات البرودكشن.**
:::
:::

:::q Someone changed a security group in the console. Terraform state is now out of date. What do you do?
Two halves — the fix, and the reason. Only giving the first reads as junior.

**The fix:**

```sh
terraform plan                    # see the drift. Do NOT apply blindly
terraform apply -refresh-only     # reconcile state with reality, changes nothing real
terraform import ...              # if they created something new
```

Then make a **deliberate** decision:

| Decision | Action |
|:---|:---|
| The console change should stay | Write it into the code, then `apply` — code and reality agree |
| The console change should go | Let `apply` revert it |

:::warn Reverting someone's emergency fix causes a second incident
If that security group change was an urgent fix during an outage, a blind
`terraform apply` re-breaks production. Find out *why* it was changed before
you undo it.
:::

**The reason it happened:** console write access existed. The durable fix is
process, not commands:

- Remove human write permissions in production; the pipeline's identity is
  the only thing that can apply.
- Add a **scheduled drift check** — `terraform plan -detailed-exitcode`
  exits 2 on a diff, so it is a one-line CI job that finds this in an hour
  rather than in six weeks.
- Tag resources `ManagedBy = terraform` so a human in the console can see
  they should not touch it.

:::ar
جاوب على نصين: **الحل**، وبعدين **سبب حدوثها**. اللي بيقول النص الأول
بس بيبان جونيور.

**الحل:**

```sh
terraform plan                    # شوف الفرق. **ومتعملش apply على أعمى**
terraform apply -refresh-only     # وفّق الـ state مع الواقع، من غير تغيير حقيقي
terraform import ...              # لو عملوا حاجة جديدة
```

**وبعدين قرّر بوعي:**

| القرار | التصرّف |
|:---|:---|
| التغيير يفضل | اكتبه في الكود، وبعدين `apply` — فالكود والواقع يتفقوا |
| التغيير يروح | سيب `apply` يرجّعه |

:::warn وإنك ترجّع إصلاح طارئ عمله حد، **ده بيعمل مشكلة تانية**
لو تغيير الـ security group ده كان **إصلاح مستعجل وقت انقطاع**، فالـ
`apply` الأعمى **بيرجّع البرودكشن للعطل تاني**.

**اعرف ليه اتغيّر قبل ما ترجّعه.** اسأل. دقيقة سؤال أرخص من انقطاع تاني.
:::

**والسبب الحقيقي لحدوثها:** إن حد كان معاه **صلاحية كتابة على الكونسول**.

والحل الدايم **عملية، مش أوامر**:

- **اشيل صلاحيات الكتابة البشرية من البرودكشن.** هوية الـ pipeline
  هي الوحيدة اللي تقدر تعمل apply.
- **حُط drift check بجدول.** `terraform plan -detailed-exitcode` بيرجّع
  ٢ لو فيه فرق، فهي **وظيفة CI من سطر واحد** بتكتشف ده في **ساعة** مش
  في ٦ أسابيع.
- **حُط تاج `ManagedBy = terraform`** على الموارد، عشان أي حد يفتح
  الكونسول يشوف إنه مش المفروض يلمسها.
:::
:::

:::q `Error acquiring the state lock`. What is it protecting, and when is `force-unlock` safe?
The lock prevents **two applies running at once**. Without it, two engineers
reading the same state, each computing a plan from it, and each writing back
their result produces a state file that describes neither — with real
resources orphaned or duplicated.

```diagram
   no lock:
   engineer A  read state ──→ plan ──→ apply ──→ write state
   engineer B      read state ──→ plan ──→ apply ──→ write state
                                                     └─ overwrites A's
                                                        A's resources now
                                                        exist but are
                                                        untracked
```

**Legitimate causes:** someone is genuinely applying right now; or a previous
run crashed (CI runner killed, laptop closed) and left the lock behind.

**`force-unlock` is safe only when you have verified no apply is running.**
Check who holds it first — the error message names the user, the operation
and the timestamp:

```sh
terraform force-unlock <LOCK_ID>
```

Force-unlocking while an apply is genuinely in progress is how you get the
corrupted state the lock exists to prevent.

:::ar
اللوك بيمنع **تنفيذ اثنين `apply` في نفس الوقت**.

من غيره، لو مهندسين قرأوا نفس الـ state، وكل واحد حسب خطته منها، وكل
واحد كتب نتيجته — الملف اللي بيطلع في الآخر **مش بيوصف أي واحد منهم**.
والنتيجة موارد حقيقية يتيمة أو مكرّرة.

بص على الرسمة فوق: المهندس B كتب فوق شغل A، فموارد A **موجودة فعلاً**
بس **مش مسجّلة في أي state**.

**والأسباب المشروعة للرسالة دي:**

1. فيه حد **فعلاً** بيعمل apply دلوقتي. **استنى.**
2. تنفيذ قديم **مات** (runner اتقتل، لاب اتقفل) وسايب اللوك وراه.

**و `force-unlock` آمنة بس لما تتأكد إن مفيش apply شغّال.**

والرسالة نفسها بتقولك **مين ماسك اللوك، وعمل إيه، وامتى**:

```sh
terraform force-unlock <LOCK_ID>
```

**وإنك تعمل force-unlock وفيه apply فعلاً شغّال، ده بالظبط إزاي تجيب
الـ state الفاسدة اللي اللوك موجود عشان يمنعها.**

فاسأل الفريق الأول. الرسالة فيها اسم اليوزر — كلّمه.
:::
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

:::ar بالمصري · الخلاصة
1. **كود ← plan ← apply.** واقرا الـ plan **كل مرة**.
2. **`-/+` معناها امسح واعمل من الأول.** على داتابيز، دي **ضياع داتا**.
3. **الـ state بتربط كودك بالموارد الحقيقية**، وفيها **أسرار مكتوبة
   صريح**، **وممنوع تتعمل commit** خالص.
4. **state بعيدة مع locking** من اللحظة اللي يبقى فيها شخص تاني معاك.
5. **state واحدة = دائرة انفجار واحدة.** قسّم على أساس **معدّل التغيير**.
6. **`state rm` مش بتمسح المورد** — بتسيبه يتيم، شغّال وبياكل فلوس.
7. **فعّل versioning على البكت النهاردة.** ده الفرق بين إزعاج وكارثة.
8. **`terraform plan -out=tfplan`** وبعدين `apply tfplan` — عشان تطبّق
   **الخطة اللي راجعتها** مش خطة جديدة.
:::
