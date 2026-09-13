---
title: Building a Cluster with kops
slug: kops-cluster-setup
type: runbook
domain: 03-kubernetes
tags: [kubernetes, kops, aws, cluster]
keywords: [kops, state store, s3, route53, instance group, rolling update,
           validate, etcd manager, cluster spec, node group, self-managed,
           كوبس, كلاستر, تنصيب, انشاء]
level: 3
status: stable
prerequisites: [kubernetes-architecture, networking-basics]
related: [kubernetes-architecture, terraform, kubernetes-troubleshooting,
          devops-interview-questions]
updated: 2026-09-13
---

# Building a Cluster with kops

> kops treats a cluster as a declarative object stored in S3 — you edit the spec, then tell it to make reality match, which is exactly the Kubernetes model applied to the cluster itself.

## What is it?

kops (**K**ubernetes **Op**eration**s**) creates and manages
**self-managed** Kubernetes clusters on AWS: it provisions the VMs, runs the
control plane on machines you own, and manages upgrades.

```diagram
   YOU                    STATE STORE (S3)          AWS
   ───                    ────────────────          ───
   kops create      →     cluster spec        →     ASGs, EC2, ELB,
   kops edit        →     (YAML, versioned)         Route53, EBS, IAM,
   kops update      →                               security groups
                                │
   kops validate    ←───────────┴─────────────→     control plane runs on
                          desired vs actual         YOUR instances
```

:::ar
الـ **kops** أداة بتعمل وتدير كلاسترات كوبرنيتيس **إنت اللي بتملكها
وبتشغّلها** (self-managed) على AWS.

يعني هي بتعملك السيرفرات، **وبتشغّل الـ control plane على ماكينات بتاعتك
إنت** — مش زي EKS اللي أمازون بتشغّل الـ control plane فيه وإنت مش شايفه.

**وأهم فكرة فيها، وهي اللي بتخليها منطقية:**

kops بيعامل **الكلاستر نفسه** بنفس طريقة كوبرنيتيس: **إنت بتوصف المطلوب،
وهو بيخلي الواقع يطابقه.**

فيه ملف YAML بيوصف الكلاستر (اسمه الـ **spec**)، متخزّن في **S3**. وإنت
بتعدّل الملف ده، وبعدين بتقول لـ kops «طبّق»، وهو بيقارن ويعمل اللي ناقص.

**ونفس فكرة الـ reconciliation**، بس على مستوى البنية التحتية مش البودات.

:::key وامتى تستخدم kops أصلاً؟
**خلينا نكون صريحين: لو إنت على AWS ومحتاج كلاستر جديد النهاردة، غالباً
عايز EKS مش kops.**

| استخدم **EKS** لما | استخدم **kops** لما |
|:---|:---|
| عايز أمازون تشغّل الـ control plane | **مضطر** تتحكم في الـ control plane |
| مش عايز توجع دماغك بالتحديثات | محتاج إعدادات مفيش غير kops بيسمح بيها |
| الفريق صغير | عندك فريق منصة فعلاً |
| — | **بتتعلّم إزاي الكلاستر بيتبني من جواه** |

**والسبب التعليمي ده مش تافه.** kops بيوريك **كل قطعة** بتتعمل إزاي —
الـ etcd، والشهادات، والـ ASGs — وده بيخليك **تفهم** كوبرنيتيس بدل ما
تستخدمه. وده لوحده سبب كافي إنك تبنيه مرة بإيدك.
:::
:::

## Before you start

| Requirement | Why | Check |
|:---|:---|:---|
| An AWS account with admin | kops creates IAM, VPC, EC2, Route53 | `aws sts get-caller-identity` |
| **A registered domain**, or a Route53 hosted zone | kops publishes the API endpoint in DNS | `aws route53 list-hosted-zones` |
| `kubectl` | To use the cluster afterwards | `kubectl version --client` |
| An SSH key pair | kops installs the public key on every node | `ls ~/.ssh/id_ed25519.pub` |

```sh title="Install the tools"
# kops — check the current release rather than copying a version from a blog
curl -Lo kops https://github.com/kubernetes/kops/releases/latest/download/kops-linux-amd64
chmod +x kops && sudo mv kops /usr/local/bin/

kops version
aws --version
```

:::warn kops needs real DNS, and this is the step people get stuck on
kops publishes the API server address as a DNS record, and every node resolves
it to join. So you need a hosted zone kops can write to.

You have three options:

| Option | When |
|:---|:---|
| A domain in Route53 | Cleanest. Register one, or delegate a subdomain |
| A **subdomain** delegated to Route53 | Your domain lives elsewhere: create `k8s.example.com` as a hosted zone and add its NS records at your registrar |
| `--dns=none` | Newer kops. No public DNS, but you manage endpoint reachability yourself |

Gossip-based clusters (names ending `.k8s.local`) removed the DNS requirement
and were the usual tutorial shortcut. They are **deprecated** — do not build
anything new on them.
:::

:::ar قبل ما تبدأ
| المطلوب | ليه | تتأكد إزاي |
|:---|:---|:---|
| حساب AWS بصلاحيات | kops بيعمل IAM و VPC و EC2 | `aws sts get-caller-identity` |
| **دومين حقيقي** أو hosted zone | kops بينشر عنوان الـ API في الـ DNS | `aws route53 list-hosted-zones` |
| `kubectl` | تستخدم الكلاستر بعد كده | `kubectl version --client` |
| مفتاح SSH | kops بيحطه على كل نود | `ls ~/.ssh/id_ed25519.pub` |

:::danger والـ DNS هي الخطوة اللي الناس بتقف عندها
kops **بينشر عنوان الـ API server كـ DNS record**، وكل نود بتترجم الاسم
ده عشان تنضم للكلاستر.

**فإنت محتاج hosted zone الـ kops يقدر يكتب فيها.** مفيش حل تاني.

| الاختيار | امتى |
|:---|:---|
| دومين في Route53 | **الأنضف** |
| **subdomain** مفوّض لـ Route53 | دومينك في مكان تاني: اعمل `k8s.example.com` كـ hosted zone وحط الـ NS records عند مسجّل الدومين |
| `--dns=none` | نسخ kops الحديثة. من غير DNS عام، بس إنت اللي تدبّر الوصول |

**وانتبه:** الكلاسترات اللي أسماءها بتنتهي بـ `.k8s.local` (اللي اسمها
**gossip**) كانت بتشيل شرط الـ DNS، **وكانت الاختصار في كل الشروحات**.

**دي اتشالت ومابقتش مدعومة.** فلو لقيت شرح بيستخدمها، **الشرح ده قديم**،
**ومتبنيش حاجة جديدة عليها**.
:::
:::

## Step 1 — the state store

kops keeps the cluster spec in an S3 bucket. This bucket **is** your cluster
definition: lose it and you cannot manage the cluster any more.

```sh
export NAME=k8s.example.com
export KOPS_STATE_STORE=s3://kops-state-example-com

aws s3api create-bucket \
  --bucket kops-state-example-com \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

# Versioning is NOT optional — it is how you recover a bad spec change
aws s3api put-bucket-versioning \
  --bucket kops-state-example-com \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket kops-state-example-com \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block public access. The spec contains cluster topology and CA material.
aws s3api put-public-access-block \
  --bucket kops-state-example-com \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

:::danger The state store is as sensitive as the cluster
It holds the cluster CA and the spec. Anyone who can read it can generate
admin credentials for your cluster.

Encrypt it, block public access, restrict it with an IAM policy to the people
and CI roles that manage clusters, and **turn on versioning before your first
`kops create`** — a bad `kops edit` is otherwise unrecoverable.
:::

:::ar الخطوة ١ — مخزن الحالة
kops بيحفظ وصف الكلاستر في bucket على S3. **والـ bucket ده هو تعريف
الكلاستر نفسه** — تضيّعه، **تبطّل تقدر تدير الكلاستر خالص**.

:::danger ومخزن الحالة **خطير زي الكلاستر بالظبط**
جواه **شهادة الـ CA بتاعة الكلاستر** والـ spec.

**فأي حد يقدر يقراه، يقدر يولّد صلاحيات admin على كلاسترك.**

**فاعمل ٤ حاجات، وكلهم قبل أول `kops create`:**

1. **شفّره** (SSE)
2. **امنع الوصول العام** تماماً
3. **حدّد IAM policy** للناس والأدوار اللي بتدير كلاسترات بس
4. **فعّل الـ versioning** — ودي أهمهم، عشان `kops edit` غلط **من غيرها
   مالهوش رجعة**

الـ versioning هنا بالظبط زي versioning الـ state بتاع تيرافورم: **الفرق
بين إزعاج ٥ دقايق وكارثة**.
:::
:::

## Step 2 — create the cluster spec

`kops create cluster` **writes the spec**. It does not build anything yet.

```sh
kops create cluster \
  --name=${NAME} \
  --state=${KOPS_STATE_STORE} \
  --zones=eu-west-1a,eu-west-1b,eu-west-1c \
  --control-plane-count=3 \
  --control-plane-size=t3.medium \
  --node-count=3 \
  --node-size=t3.large \
  --networking=cilium \
  --topology=private \
  --bastion \
  --ssh-public-key=~/.ssh/id_ed25519.pub \
  --kubernetes-version=1.31.4 \
  --dry-run -o yaml > cluster.yaml
```

| Flag | Why it matters |
|:---|:---|
| `--zones` with **three** AZs | etcd needs a quorum; two AZs cannot survive one failing |
| `--control-plane-count=3` | One is a single point of failure. Use an **odd** number |
| `--networking=cilium` | The CNI. Cilium/Calico give you NetworkPolicy; the default may not |
| `--topology=private` | Nodes get **no public IPs**. Strongly preferred |
| `--bastion` | With private topology you need a jump host for SSH |
| `--kubernetes-version` | Pin it. Do not inherit whatever is newest |
| `--dry-run -o yaml` | **Review before creating.** Commit this file to Git |

:::key Three control-plane nodes, and why odd numbers
etcd needs a **majority** to accept a write.

| Nodes | Majority | Can survive |
|:---|:---|:---|
| 1 | 1 | 0 failures |
| **2** | **2** | **0 failures** — worse than 1, since either failure stops writes |
| 3 | 2 | 1 failure |
| 5 | 3 | 2 failures |

Two control-plane nodes are strictly worse than one: twice the failure
probability, no added tolerance. Always odd.
:::

```sh
# Review it, then commit it, THEN create
less cluster.yaml
git add cluster.yaml && git commit -m "kops: initial cluster spec"

kops create -f cluster.yaml --state=${KOPS_STATE_STORE}
kops create secret --name ${NAME} sshpublickey admin -i ~/.ssh/id_ed25519.pub
```

:::ar الخطوة ٢ — اكتب وصف الكلاستر
**خد بالك:** `kops create cluster` **بيكتب الوصف بس**. **مش بيبني أي
حاجة لسه.** (زي `kubectl apply` اللي بيكتب في etcd وبس.)

| الفلاج | ليه مهم |
|:---|:---|
| `--zones` بـ **٣ مناطق** | الـ etcd محتاجة **أغلبية**، ومنطقتين مش كفاية |
| `--control-plane-count=3` | واحد = نقطة فشل واحدة. **والعدد لازم فردي** |
| `--networking=cilium` | الـ CNI. Cilium/Calico بيدوك **NetworkPolicy** |
| `--topology=private` | النودات **من غير IPs عامة**. مفضّل بشدة |
| `--bastion` | مع الـ private محتاج جهاز قفز عشان SSH |
| `--kubernetes-version` | **ثبّتها.** متسيبهاش تاخد الأحدث |
| `--dry-run -o yaml` | **راجع قبل ما تعمل.** واعمل commit للملف ده |

:::key ليه ٣ control-plane؟ وليه عدد **فردي**؟
الـ **etcd محتاجة أغلبية** عشان تقبل أي كتابة.

| العدد | الأغلبية | بيستحمل كام عطل |
|:---|:---|:---|
| ١ | ١ | **صفر** |
| **٢** | **٢** | **صفر** — **أوحش من واحد!** |
| ٣ | ٢ | **١** |
| ٥ | ٣ | ٢ |

**وركّز في سطر الاتنين ده:** اتنين **أسوأ** من واحد. ليه؟ عشان الأغلبية
بقت ٢، **فأي واحد فيهم يقع، الكتابة بتقف** — وإنت ضاعفت احتمال العطل
من غير ما تكسب أي تحمّل.

**فالعدد فردي دايماً.** ٣ للبرودكشن العادي، ٥ للكلاسترات الكبيرة.
:::
:::

## Step 3 — build it

```sh
# What WOULD be created — read this, it is a long list
kops update cluster --name ${NAME} --state=${KOPS_STATE_STORE}

# Actually build it, and write a kubeconfig entry
kops update cluster --name ${NAME} --state=${KOPS_STATE_STORE} --yes --admin
```

kops now creates, roughly in order:

```diagram
   IAM roles and instance profiles
        ↓
   VPC · subnets (public + private) · NAT gateways · route tables
        ↓
   Security groups
        ↓
   Route53 records:  api.k8s.example.com
        ↓
   Launch templates + Auto Scaling Groups
        ↓  ASGs boot instances; each runs nodeup on first boot
   Control-plane instances:  etcd, apiserver, scheduler, controller-manager
        ↓
   Worker instances:  kubelet joins via the API endpoint from DNS
        ↓
   Addons: CNI, CoreDNS, and whatever the spec declares
```

Then wait — this takes 5–15 minutes:

```sh
kops validate cluster --name ${NAME} --state=${KOPS_STATE_STORE} --wait 15m
kubectl get nodes -o wide
```

:::warn `kops validate` is the real completion signal, not `kops update --yes`
`--yes` returns once the AWS resources are *requested*. Instances still have to
boot, `nodeup` has to run, etcd has to form a quorum and nodes have to join.

Validation failing for the first several minutes is expected. Failing after 15
minutes is not — go to [What goes wrong](#what-goes-wrong).
:::

:::ar الخطوة ٣ — ابنيه فعلاً
```sh
kops update cluster --name ${NAME} --state=${KOPS_STATE_STORE}          # شوف هيعمل إيه
kops update cluster --name ${NAME} --state=${KOPS_STATE_STORE} --yes --admin   # نفّذ
```

**والترتيب اللي بيحصل:** IAM ← شبكة (VPC و subnets و NAT) ← security
groups ← **سجلات Route53** ← ASGs ← الماكينات بتقوم وكل واحدة بتشغّل
`nodeup` ← الـ control plane ← النودات بتنضم ← الإضافات.

:::key والإشارة الحقيقية للانتهاء هي `kops validate`، **مش** `update --yes`
الـ `--yes` **بيرجع أول ما موارد AWS تتطلب**.

وبعدها لسه: الماكينات لازم تقوم، و `nodeup` لازم يشتغل، **و etcd لازم
تكوّن أغلبية**، والنودات لازم تنضم.

```sh
kops validate cluster --name ${NAME} --wait 15m
```

**والفشل في أول كام دقيقة طبيعي جداً ومتخضش منه.** الفشل بعد ١٥ دقيقة
**مش طبيعي**.
:::
:::

## Step 4 — day-two operations

### Changing the cluster

Everything is an edit to the spec followed by an update. Same loop, always:

```diagram
   kops edit cluster       ──→  changes the spec in S3
   kops edit ig nodes      ──→  changes an instance group
        │
        ↓
   kops update cluster --yes    ──→  changes AWS resources
        │
        ↓
   kops rolling-update cluster --yes  ──→  replaces instances, one at a time
                                            (only if instances must change)
```

```sh
# Scale the workers: edit minSize/maxSize
kops edit ig --name ${NAME} nodes

kops update cluster --name ${NAME} --yes
# Scaling an ASG needs no rolling update; changing the AMI or instance type does
```

### Upgrading Kubernetes

```sh
# 1. See what kops proposes
kops upgrade cluster --name ${NAME}

# 2. Pin the version deliberately instead
kops edit cluster --name ${NAME}      # set spec.kubernetesVersion: 1.32.1

# 3. Apply to the spec, then roll the instances
kops update cluster --name ${NAME} --yes
kops rolling-update cluster --name ${NAME} --yes \
  --control-plane-interval=5m --node-interval=3m
```

:::danger Upgrade one minor version at a time, and take an etcd backup first
Kubernetes supports **one minor version** of skew between control plane and
kubelets. Jumping 1.29 → 1.32 is unsupported and will break; go 1.29 → 1.30 →
1.31 → 1.32, validating between each.

Before any control-plane change:

```sh
# kops stores etcd backups in the state store; confirm they exist
aws s3 ls ${KOPS_STATE_STORE}/${NAME}/backups/etcd/main/ | tail -5
```

A rolling update **replaces** control-plane instances. If etcd cannot form a
quorum during that, you are restoring from backup — so verify the backup is
recent *before* you start, not after.
:::

### Deleting

```sh
kops delete cluster --name ${NAME} --state=${KOPS_STATE_STORE}         # preview
kops delete cluster --name ${NAME} --state=${KOPS_STATE_STORE} --yes   # do it
```

:::warn Delete leaves things behind
kops removes what it created. It does **not** remove:

- EBS volumes from PersistentVolumes (they were created by the CSI driver)
- Load balancers created by `Service type=LoadBalancer`
- Route53 records added by external-dns

Delete `LoadBalancer` Services and PVCs **before** deleting the cluster, or you
pay for orphaned resources nobody can find later.
:::

:::ar الخطوة ٤ — التشغيل اليومي
**كل حاجة نفس الحلقة: عدّل الوصف، وبعدين طبّق.**

```diagram
   kops edit cluster / edit ig     ──→  بيغيّر الوصف في S3
        ↓
   kops update cluster --yes       ──→  بيغيّر موارد AWS
        ↓
   kops rolling-update --yes       ──→  بيستبدل الماكينات، واحدة واحدة
                                        (بس لو الماكينات نفسها لازم تتغير)
```

**فرق مهم:** تكبير عدد النودات **مش محتاج** rolling update. تغيير نوع
الماكينة أو الـ AMI **محتاج**.

:::danger التحديث: **نسخة صغرى واحدة في المرة**، **وباك أب etcd الأول**
كوبرنيتيس بيسمح بفرق **نسخة صغرى واحدة بس** بين الـ control plane
والـ kubelets.

**فالقفز من 1.29 لـ 1.32 مش مدعوم وهيبوّظ.** امشي 1.29 ← 1.30 ← 1.31 ←
1.32، **واعمل validate بين كل واحدة**.

**وقبل أي تغيير في الـ control plane:**

```sh
aws s3 ls ${KOPS_STATE_STORE}/${NAME}/backups/etcd/main/ | tail -5
```

الـ rolling update **بيستبدل ماكينات الـ control plane**. ولو الـ etcd
**ما قدرتش تكوّن أغلبية** أثناء ده، إنت رايح تسترجع من باك أب.

**فاتأكد إن الباك أب حديث قبل ما تبدأ، مش بعدين.**
:::

:::warn والمسح **بيسيب حاجات وراه**
kops بيمسح اللي **هو** عمله. **وهو مش بيمسح:**

- الـ **EBS volumes** بتاعة الـ PersistentVolumes (الـ CSI هو اللي عملها)
- الـ **load balancers** اللي `Service type=LoadBalancer` عملها
- سجلات Route53 اللي external-dns ضافها

**فامسح الـ LoadBalancer Services والـ PVCs قبل** ما تمسح الكلاستر —
وإلا هتدفع في موارد يتيمة محدش هيلاقيها بعد شهور.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `validate` fails: nodes not joining | Nodes cannot resolve or reach `api.<name>` | Check the Route53 record and security groups |
| Stuck at 1 of 3 control-plane nodes | etcd has no quorum | `kops get instances`; check etcd logs on the running node |
| `error reading s3://...` | Wrong `KOPS_STATE_STORE`, or no IAM permission | `aws s3 ls ${KOPS_STATE_STORE}` |
| `InsufficientInstanceCapacity` | The AZ has no capacity for that type | Another instance type or AZ |
| Nodes `NotReady`, pods `ContainerCreating` | CNI addon not healthy | `kubectl -n kube-system get pods` |
| `kubectl` works, then stops after a while | The admin credential from `--admin` is short-lived | `kops export kubecfg --admin` again |
| Rolling update hangs on one node | A PodDisruptionBudget blocks draining | `kubectl get pdb -A`; fix or `--cloudonly` deliberately |
| Cluster works, `kops validate` fails | Spec drift from a manual console change | `kops update --yes` to reassert the spec |

```sh title="Where to look when a node does not join"
kops get instances --name ${NAME}
ssh -J ubuntu@bastion.${NAME} ubuntu@<node-private-ip>

sudo journalctl -u kops-configuration -n 100   # nodeup, the first-boot agent
sudo journalctl -u kubelet -n 100
```

:::ar الأعطال
| العَرَض | السبب | الحل |
|:---|:---|:---|
| النودات مش بتنضم | مش قادرة توصل `api.<name>` | شيك الـ Route53 والـ security groups |
| واقف على ١ من ٣ control-plane | **الـ etcd مفيش أغلبية** | شوف لوجز etcd على النود الشغالة |
| `error reading s3://...` | `KOPS_STATE_STORE` غلط أو مفيش صلاحية | `aws s3 ls ${KOPS_STATE_STORE}` |
| `InsufficientInstanceCapacity` | المنطقة مفيهاش النوع ده | نوع تاني أو منطقة تانية |
| نودات `NotReady` | **الـ CNI** مش سليم | `kubectl -n kube-system get pods` |
| `kubectl` وقف فجأة | صلاحية `--admin` **قصيرة الأجل** | `kops export kubecfg --admin` تاني |
| الـ rolling update معلّق على نود | **PodDisruptionBudget** مانعة التصريف | `kubectl get pdb -A` |

**ولما نود ترفض تنضم، ادخلها وشوف:**

```sh
sudo journalctl -u kops-configuration -n 100   # nodeup، وكيل أول إقلاع
sudo journalctl -u kubelet -n 100
```

**والترتيب في التشخيص:** الـ `kops-configuration` هو اللي بيجهّز النود
أول ما تقوم. **لو هو فشل، الـ kubelet عمره ما هيبدأ أصلاً** — فابدأ بيه.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Why does a control plane need an odd number of nodes?
Because etcd uses **Raft**, and Raft requires a **majority** (a quorum) to
commit a write. With N members the quorum is `floor(N/2) + 1`.

| Members | Quorum | Failures tolerated |
|:---|:---|:---|
| 1 | 1 | 0 |
| **2** | **2** | **0** |
| 3 | 2 | 1 |
| 4 | 3 | 1 |
| 5 | 3 | 2 |

Two key observations:

- **Two is strictly worse than one.** Same zero tolerance, twice the hardware
  that can fail — so the probability of an outage doubles for no benefit.
- **Four is no better than three.** Both tolerate one failure, but four costs
  more and makes every write wait on a larger quorum.

**What happens when quorum is lost:** etcd goes **read-only**. The API server
can still serve reads, so `kubectl get` works — but no writes succeed, so no
deploys, no scaling, no rescheduling. Running pods keep running, which makes
the failure quiet and easy to misdiagnose.

:::ar
عشان الـ etcd بتستخدم **Raft**، و Raft محتاجة **أغلبية** عشان تأكّد أي
كتابة. ومع N عضو، الأغلبية = `floor(N/2) + 1`.

| الأعضاء | الأغلبية | بيستحمل |
|:---|:---|:---|
| ١ | ١ | صفر |
| **٢** | **٢** | **صفر** |
| ٣ | ٢ | ١ |
| ٤ | ٣ | ١ |
| ٥ | ٣ | ٢ |

**ملاحظتين مهمين:**

1. **الاتنين أسوأ من الواحد** — نفس التحمّل (صفر)، بس **ضعف الهاردوير
   اللي ممكن يقع**. يعني احتمال العطل **اتضاعف مقابل لا شيء**.
2. **الأربعة مش أحسن من التلاتة** — الاتنين بيستحملوا عطل واحد، بس
   الأربعة **بتكلّف أكتر** وبتخلي كل كتابة تستنى أغلبية أكبر.

**وإيه اللي بيحصل لما الأغلبية تضيع؟**

**الـ etcd بتبقى للقراءة بس.** فالـ API server لسه بيرد على القراءة —
يعني `kubectl get` **شغّال عادي** — **بس مفيش أي كتابة بتنجح**.

**فمفيش ديبلوي، ولا scaling، ولا إعادة جدولة.** والبودات الشغالة
**بتفضل شغالة**.

**وده بيخلي العطل ساكت وسهل تشخيصه غلط** — الدنيا شكلها ماشية والكلاستر
فعلياً مشلول.
:::
:::

:::q kops or EKS? · نستخدم kops ولا EKS؟
Ask what constraint forces the choice, then answer.

| | kops | EKS |
|:---|:---|:---|
| Control plane | **Yours** — your instances, your problem | AWS runs it, per-hour fee |
| Upgrades | You run them, one minor at a time | AWS-assisted, still your responsibility for nodes |
| etcd backups | **Yours to verify** | AWS manages |
| Customisation | Full — any flag, any component | Limited to what EKS exposes |
| Time to first cluster | 15 minutes plus DNS setup | Minutes, or one Terraform module |
| Ongoing cost | EC2 only | EC2 plus the control-plane fee |
| Who to call at 3am | **You** | AWS support |

**Choose EKS by default.** The control-plane fee is far less than the salary
cost of operating etcd yourself, and "we run our own control plane" is
undifferentiated work.

**Choose kops when** you need control EKS does not expose, you are not on AWS
in the same account model, or you have a regulatory reason to own every
component.

:::key The answer that scores
"I would default to managed, and the burden of proof is on self-managing."
Then name the *specific* thing EKS cannot do that you need. A candidate who
picks kops because it is more interesting has not costed the on-call.
:::

:::ar
اسأل: **إيه القيد اللي بيفرض الاختيار؟** وبعدين جاوب.

| | kops | EKS |
|:---|:---|:---|
| الـ control plane | **بتاعك** — ماكيناتك ومشكلتك | أمازون بتشغّله برسوم |
| التحديثات | **إنت بتعملها** | أمازون بتساعد |
| باك أب etcd | **مسؤوليتك تتأكد منه** | أمازون بتديره |
| التخصيص | **كامل** | محدود باللي EKS بيسمح بيه |
| أول كلاستر | ١٥ دقيقة + إعداد DNS | دقايق |
| مين تكلّمه الساعة ٣ الفجر | **إنت** | دعم أمازون |

**الافتراضي: EKS.**

رسوم الـ control plane **أرخص بكتير من مرتب الناس اللي هتشغّل etcd
بنفسها**، و«إحنا بنشغّل الـ control plane بتاعنا» شغل **مش بيميّزك في
حاجة**.

**واختار kops لما:** تحتاج تحكّم EKS مش بيوفّره، أو مش على AWS بنفس
النموذج، أو عندك **سبب رقابي** تملك كل مكوّن.

**والإجابة اللي بتاخد درجة:**

> **«أنا هبدأ من المُدار، وعبء الإثبات على اللي عايز يشغّل بنفسه.»**

وبعدين **سمّي الحاجة المحددة** اللي EKS مش بيوفّرها وإنت محتاجها.

واللي بيختار kops **عشان هي أمتع**، ده **ما حسبش تكلفة الـ on-call**.
:::
:::

:::q You lose the S3 state store. What can you still do?
**Almost nothing, from kops' point of view.** The cluster keeps running — the
control plane and kubelets do not consult S3 — but you have lost the ability to
manage it: no `kops update`, no `kops rolling-update`, no upgrades, no scaling
through kops.

You also lose the cluster CA material kops keeps there, and the etcd backups it
writes there.

**Recovery options, worst to best:**

1. S3 **versioning** enabled → restore the deleted objects. This is why
   versioning is step one.
2. Reconstruct the spec by hand from the running cluster and AWS resources —
   possible, tedious, and error-prone.
3. Build a new cluster and migrate workloads.

**The lesson being tested** is that the state store is a **critical, stateful
dependency of your tooling**, exactly like Terraform state — and that it needs
versioning, encryption, restricted IAM and a tested restore, decided before the
first `kops create`.

:::ar
**من ناحية kops، تقريباً مفيش حاجة تقدر تعملها.**

الكلاستر **بيفضل شغّال** — الـ control plane والـ kubelets **مش بيسألوا
S3 أصلاً** — **بس إنت خسرت القدرة على إدارته**: مفيش `kops update`،
ولا `rolling-update`، ولا تحديثات، ولا scaling عن طريق kops.

**وكمان خسرت** شهادة الـ CA اللي kops بيحفظها هناك، **وباك أبات الـ etcd**.

**والاسترجاع، من الأوحش للأحسن:**

1. **الـ versioning مفعّل** ← ترجّع الملفات المحذوفة. **وعشان كده هي
   الخطوة رقم واحد.**
2. **تعيد بناء الـ spec بإيدك** من الكلاستر الشغّال وموارد AWS — ممكن،
   بس مُرهق ومعرّض للغلط.
3. **تبني كلاستر جديد وتنقل الشغل.**

**والدرس اللي بيتقاس عليه:** إن مخزن الحالة **اعتمادية حرجة ذات حالة
لأدواتك** — **بالظبط زي state تيرافورم**.

يعني محتاج: **versioning، وتشفير، و IAM مضيّق، واختبار استرجاع فعلي** —
**وكل ده يتقرر قبل أول `kops create`**، مش بعدين.
:::
:::

## Key takeaways

- **kops applies the Kubernetes model to the cluster itself**: edit a spec in
  S3, then reconcile AWS to match it.
- **The state store is as sensitive as the cluster.** Versioning, encryption
  and tight IAM, before the first create.
- **`kops create cluster` only writes the spec.** `kops update --yes` builds,
  and `kops validate` is the real completion signal.
- **Odd control-plane counts, three AZs.** Two nodes are worse than one.
- **Upgrade one minor version at a time**, with a verified etcd backup first.
- **Delete leaves orphans** — LoadBalancers and PVC volumes outlive the
  cluster.
- **Default to EKS.** Self-managing a control plane needs a reason you can
  name.

:::ar الخلاصة
1. **kops بيطبّق نموذج كوبرنيتيس على الكلاستر نفسه**: عدّل وصف في S3،
   وخلّي AWS تطابقه.
2. **مخزن الحالة خطير زي الكلاستر.** versioning وتشفير و IAM مضيّق،
   **قبل أول إنشاء**.
3. **`kops create cluster` بيكتب الوصف بس.** الـ `update --yes` بيبني،
   **و `kops validate` هي إشارة الانتهاء الحقيقية**.
4. **عدد control-plane فردي، وتلات مناطق.** **الاتنين أوحش من الواحد.**
5. **حدّث نسخة صغرى واحدة في المرة**، **وباك أب etcd متأكد منه الأول**.
6. **المسح بيسيب يتامى** — الـ LoadBalancers و volumes الـ PVCs
   **بيعيشوا بعد الكلاستر**.
7. **الافتراضي EKS.** إنك تشغّل control plane بنفسك محتاج **سبب تقدر
   تسمّيه**.
:::
