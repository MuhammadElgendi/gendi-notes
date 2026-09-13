---
title: Kubernetes Storage
slug: kubernetes-storage
type: guide
domain: 03-kubernetes
tags: [kubernetes, storage, volumes]
keywords: [pv, pvc, storageclass, csi, dynamic provisioning, access modes,
           readwriteonce, reclaim policy, volumeBindingMode, snapshot, expansion,
           تخزين, ديسك, أحجام, بيانات]
level: 3
status: stable
prerequisites: [kubernetes-pods]
related: [kubernetes-workloads, kubernetes-architecture,
          kubernetes-troubleshooting, devops-interview-questions]
updated: 2026-09-13
---

# Kubernetes Storage

> A PVC is a **request** for storage; a PV is the storage itself. You write the request, the cluster finds or creates the disk, and separating those two roles is what makes storage portable between clouds.

## What is it?

Container filesystems are destroyed with the container. Anything that must
survive needs a volume that outlives the pod.

```diagram
   YOU WRITE                  CLUSTER DOES                  CLOUD HAS
   ─────────                  ────────────                  ─────────
   PersistentVolumeClaim
   "10Gi, ReadWriteOnce"  →   StorageClass picks a      →   EBS volume
   (a REQUEST)                provisioner and creates       vol-0abc123
                              a PersistentVolume
                                     │
                              binds PVC ←→ PV (1:1, permanent)
                                     │
                              kubelet + CSI attach and mount it into the pod
```

| Object | What it is | Who writes it |
|:---|:---|:---|
| **PersistentVolume (PV)** | The actual piece of storage | Usually the provisioner |
| **PersistentVolumeClaim (PVC)** | A request for storage | **You** |
| **StorageClass** | *How* to provision, and with what parameters | Platform team |
| **CSI driver** | The plugin that talks to the storage backend | Installed once |

:::ar
فايل سيستم الكونتينر **بيموت مع الكونتينر**. فأي حاجة لازم تعيش بعده
محتاجة volume.

**والفكرة الأساسية: فصل الطلب عن التنفيذ.**

| الأوبجكت | إيه هو | مين بيكتبه |
|:---|:---|:---|
| **PVC** | **طلب** تخزين: «عايز ١٠ جيجا» | **إنت** |
| **PV** | **قطعة التخزين الحقيقية** | الـ provisioner غالباً |
| **StorageClass** | **إزاي** نجيب التخزين ده وبأي إعدادات | فريق المنصة |
| **CSI driver** | الـ plugin اللي بيكلّم الستوريدج الحقيقي | بيتنصّب مرة |

**وليه الفصل ده مهم؟**

عشان إنت كمطوّر **بتقول «عايز ١٠ جيجا»**، **ومش بتقول «اعملي EBS volume
من نوع gp3 في المنطقة الفلانية»**.

**فنفس الـ YAML بتاعك بيشتغل على AWS وعلى Azure وعلى السيرفر المحلي** —
اللي بيتغير هو الـ StorageClass بس، وده **مش ملفك إنت**.

ودي نفس فكرة الـ CRI والـ CNI: **كوبرنيتيس بيحدد الواجهة، والناس بتكتب
الـ drivers**.
:::

## How to use it

### A PVC, and a pod that uses it

```yaml title="pvc.yaml"
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: gp3            # omit → the cluster's default class
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          volumeMounts:
            - name: data
              mountPath: /var/lib/app
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: data
```

### Access modes — the constraint people misread

| Mode | Means | Reality |
|:---|:---|:---|
| **ReadWriteOnce** (RWO) | Mountable read-write by **one node** | Block storage: EBS, GCE PD, Azure Disk. **Most common** |
| **ReadOnlyMany** (ROX) | Read-only by many nodes | Rare |
| **ReadWriteMany** (RWX) | Read-write by **many nodes** | Needs a filesystem: NFS, EFS, CephFS |
| **ReadWriteOncePod** | Exactly **one pod** | Newer; the genuinely exclusive option |

:::danger `ReadWriteOnce` means one *node*, not one *pod*
This is the most misread line in Kubernetes storage.

RWO permits **several pods to share the volume, as long as they are on the same
node**. Two replicas that happen to be co-scheduled will both mount it and both
write — and most databases corrupt if two processes write the same files.

It also explains a very common deadlock: a `RollingUpdate` on a Deployment with
an RWO volume tries to start the new pod **before** removing the old one. If the
scheduler puts it on a different node, the volume cannot attach there, and the
new pod sits in `ContainerCreating` forever while the rollout hangs.

**Fixes:**

- `strategy: Recreate` on the Deployment — old pod dies before the new starts.
- Better: use a **StatefulSet**, which is designed for this.
- Use `ReadWriteOncePod` when you need true single-pod exclusivity.
:::

:::ar أنماط الوصول — والسطر اللي الناس بتقراه غلط
| النمط | معناه | الواقع |
|:---|:---|:---|
| **RWO** | قابل للكتابة من **نود واحدة** | EBS، Azure Disk. **الأشهر** |
| **ROX** | قراءة بس من نودات كتير | نادر |
| **RWX** | كتابة من **نودات كتير** | محتاج NFS أو EFS أو CephFS |
| **ReadWriteOncePod** | **بود واحد بالظبط** | الأحدث، والحصري فعلاً |

:::danger و `ReadWriteOnce` معناها **نود واحدة**، مش **بود واحد**
**دي أكتر سطر بيتقرا غلط في تخزين كوبرنيتيس.**

الـ RWO **بتسمح لكذا بود يتشاركوا الـ volume**، بشرط إنهم **على نفس النود**.

يعني نسختين اتحطّوا بالصدفة على نفس النود **هيركّبوا نفس الديسك
وهيكتبوا عليه الاتنين** — **وأغلب الداتابيزات بتتخرّب لو عمليتين كتبوا
نفس الملفات**.

**وده كمان بيفسّر قفلة شائعة جداً:**

```diagram
   Deployment بـ RollingUpdate + volume من نوع RWO
        │
        ↓
   كوبرنيتيس بيحاول يقوّم البود الجديد **قبل** ما يقفل القديم
        │
        ↓
   الـ Scheduler حطه على **نود تانية**
        │
        ↓
   الـ volume **مش قادر يتركّب** هناك (متركّب في النود القديمة)
        │
        ↓
   البود الجديد قاعد في ContainerCreating **للأبد**، والـ rollout معلّق
```

**والحلول:**

1. **`strategy: Recreate`** على الـ Deployment — القديم بيموت الأول.
2. **الأحسن: استخدم StatefulSet**، دي متصمّمة للحالة دي.
3. **`ReadWriteOncePod`** لو محتاج حصرية حقيقية لبود واحد.
:::
:::

### StorageClass — where the real decisions live

```yaml title="storageclass.yaml"
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete              # or Retain — see the warning
allowVolumeExpansion: true         # you WILL need this
volumeBindingMode: WaitForFirstConsumer   # almost always correct
```

| Field | Why it matters |
|:---|:---|
| `reclaimPolicy: Delete` | PVC deleted → **the disk and its data are deleted** |
| `reclaimPolicy: Retain` | Disk survives; you clean up manually |
| `allowVolumeExpansion: true` | Without it a full disk cannot be grown, ever |
| `volumeBindingMode` | `Immediate` provisions before scheduling — **wrong in multi-AZ** |

:::key `WaitForFirstConsumer` prevents the classic multi-AZ deadlock
With `Immediate`, the volume is created as soon as the PVC exists — in some
arbitrary availability zone. The scheduler then has to place the pod in *that*
zone. If it has no capacity there, the pod is `Pending` forever, and no amount
of adding nodes in other zones helps.

`WaitForFirstConsumer` inverts it: the volume is not created until a pod is
scheduled, so it is provisioned **in the zone the pod actually landed in**.

Make this the default for any zonal block storage.
:::

:::danger `reclaimPolicy: Delete` is the default, and it deletes your data
Delete a PVC and the underlying cloud disk is destroyed with it. No
confirmation, no recycle bin.

`kubectl delete namespace` deletes every PVC in it, and therefore every volume.
Teams have lost production databases by cleaning up a namespace they believed
was unused.

For anything stateful in production:

```yaml
reclaimPolicy: Retain
```

and back up separately — because `Retain` only preserves the disk, it does not
give you a restore process. A retained volume with no tested restore is a
disk, not a backup.
:::

:::ar الـ StorageClass — وهنا القرارات الحقيقية
| الحقل | ليه مهم |
|:---|:---|
| `reclaimPolicy: Delete` | تمسح الـ PVC ← **الديسك والداتا بيتمسحوا** |
| `reclaimPolicy: Retain` | الديسك بيفضل، وإنت بتنضّف بإيدك |
| `allowVolumeExpansion: true` | **من غيرها الديسك المليان عمره ما يكبر** |
| `volumeBindingMode` | `Immediate` **غلط مع مناطق متعددة** |

:::key و `WaitForFirstConsumer` بتمنع قفلة كلاسيكية
مع `Immediate`، الـ volume بيتعمل **أول ما الـ PVC توجد** — **في منطقة
عشوائية**.

وبعدين الـ Scheduler **مجبور** يحط البود في **المنطقة دي**. ولو مفيش
مساحة هناك، **البود `Pending` للأبد** — **وإضافة نودات في مناطق تانية
مش بتنفع**.

**و `WaitForFirstConsumer` بتعكس الترتيب:** الـ volume **مش بيتعمل** لحد
ما البود يتجدول، **فبيتعمل في المنطقة اللي البود نزل فيها فعلاً**.

**خليها الافتراضي لأي block storage مربوط بمنطقة.**
:::

:::danger و `reclaimPolicy: Delete` هي الافتراضي، **وبتمسح داتاك**
تمسح الـ PVC، **والديسك بيتدمّر معاها**. **من غير أي تأكيد، ومن غير سلة
مهملات.**

**و `kubectl delete namespace` بتمسح كل الـ PVCs اللي فيها** — **يعني كل
الـ volumes**.

وفيه فرق **ضيّعت داتابيزات إنتاج** وهي «بتنضّف namespace كانت فاكراها
مش مستخدمة».

**لأي حاجة فيها حالة في البرودكشن:**

```yaml
reclaimPolicy: Retain
```

**بس خد بالك:** الـ `Retain` **بتحافظ على الديسك بس**، **مش بتديك عملية
استرجاع**.

**والـ volume المحفوظ من غير استرجاع مجرّب — ده ديسك، مش باك أب.**
:::
:::

### Growing a volume

```sh
# Requires allowVolumeExpansion: true on the StorageClass
kubectl patch pvc data -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
kubectl get pvc data -w
```

Expansion is online for most CSI drivers. **Shrinking is never supported** —
plan sizes with that in mind.

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| PVC stuck `Pending` | No matching PV, or no default StorageClass | `kubectl describe pvc` → Events |
| Pod stuck `ContainerCreating` | Volume cannot attach — usually wrong zone or still attached elsewhere | `kubectl describe pod`; check the node's zone |
| Rollout hangs with an RWO volume | New pod on a different node | `strategy: Recreate`, or a StatefulSet |
| `volume node affinity conflict` | Volume in AZ-a, pod scheduled to AZ-b | `WaitForFirstConsumer` |
| Data gone after pod restart | `emptyDir`, not a PVC | Use a PVC |
| Cannot resize | `allowVolumeExpansion` false | Edit the class; existing PVCs then resize |
| PVC stuck `Terminating` | A pod still uses it — the finalizer is protecting you | Delete the pod first |
| Disk full but the PV is large | The **filesystem** was not grown | Most CSI drivers do it; otherwise restart the pod |

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| PVC واقفة `Pending` | مفيش PV مطابق أو مفيش StorageClass افتراضي | `describe pvc` والـ Events |
| البود في `ContainerCreating` | الـ volume مش قادر يتركّب — **منطقة غلط** غالباً | شيك منطقة النود |
| الـ rollout معلّق مع RWO | البود الجديد على نود تانية | `Recreate` أو StatefulSet |
| `volume node affinity conflict` | الـ volume في منطقة والبود في تانية | `WaitForFirstConsumer` |
| الداتا ضاعت بعد restart | ده `emptyDir` مش PVC | استخدم PVC |
| مش قادر تكبّر | `allowVolumeExpansion` مقفولة | عدّل الـ StorageClass |
| PVC واقفة `Terminating` | **فيه بود لسه بيستخدمها** — والـ finalizer **بيحميك** | امسح البود الأول |

**والسطر الأخير ده مهم:** الـ PVC اللي واقفة `Terminating` **مش عطل**.
دي كوبرنيتيس **بيمنعك** إنك تمسح ديسك لسه شغّال تحت تطبيق. **امسح البود
الأول، والـ PVC هتمشي لوحدها.**
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Explain the relationship between PV, PVC and StorageClass.
It is a **separation of concerns** between the person who needs storage and the
person who provides it.

| Object | Answers | Owned by |
|:---|:---|:---|
| **PVC** | "I need 20Gi, ReadWriteOnce" | The application developer |
| **StorageClass** | "Here is *how* we make that: gp3, encrypted, expandable" | The platform team |
| **PV** | The actual provisioned disk | Created automatically |

**Dynamic provisioning** is the normal path: you create a PVC naming a
StorageClass, the class's provisioner creates a real disk, a PV object is
created to represent it, and PVC and PV are **bound 1:1 permanently**.

**Why the indirection is worth it:** the same PVC manifest works on AWS, Azure
and a laptop cluster. Only the StorageClass differs, and that is not in the
application's repository. It is the same plug-in pattern as CRI and CNI.

**Static provisioning** still exists — an admin pre-creates PVs and PVCs bind to
whichever matches — and is used for existing NFS exports or specific hardware.

:::ar
دي **فصل مسؤوليات** بين اللي محتاج التخزين واللي بيوفّره.

| الأوبجكت | بيجاوب على | مين بيملكه |
|:---|:---|:---|
| **PVC** | «أنا محتاج ٢٠ جيجا RWO» | **المطوّر** |
| **StorageClass** | «وده **إزاي** بنجيبها: gp3، مشفّرة» | **فريق المنصة** |
| **PV** | الديسك الحقيقي بعد ما اتعمل | بيتعمل تلقائياً |

**والتوفير الديناميكي هو المسار العادي:** تعمل PVC بتسمّي StorageClass،
والـ provisioner بيعمل ديسك حقيقي، وبيتعمل PV يمثّله، **والاتنين
بيترابطوا ١:١ بشكل دائم**.

**وليه الالتفاف ده يستاهل؟**

عشان **نفس ملف الـ PVC بيشتغل على AWS وعلى Azure وعلى كلاستر على اللاب
بتاعك**. اللي بيتغير هو الـ StorageClass بس، **وده مش في ريبو التطبيق**.

**ونفس نمط الـ plugins بتاع CRI و CNI بالظبط.**
:::
:::

:::q Why does a Deployment with a PVC often fail to roll out?
Because `RollingUpdate` starts the new pod **before** terminating the old one,
and a `ReadWriteOnce` volume can only be attached to one node at a time.

```diagram
   old pod on node-1, volume attached to node-1
        │
        │  rolling update starts
        ↓
   new pod scheduled to node-2
        │
        ↓
   volume cannot attach to node-2 — still held by node-1
        │
        ↓
   new pod: ContainerCreating forever
   old pod: never terminated, because the new one is not Ready
        │
        ↓
   deadlock
```

**Three fixes, in increasing order of correctness:**

1. `strategy: Recreate` — the old pod is terminated first. Accepts downtime.
2. **Use a StatefulSet.** It replaces pods one at a time, each keeping its own
   PVC, which is exactly this problem solved properly.
3. Reconsider whether the workload should hold a volume at all — for many apps
   the answer is object storage or a managed database.

:::key
The follow-up is usually "what if two replicas end up on the same node?" — and
the answer exposes whether you know RWO is **per node, not per pod**. Both pods
mount it, both write, and a database with two writers on one filesystem
corrupts. That is the real reason StatefulSets exist.
:::

:::ar
عشان الـ `RollingUpdate` **بيقوّم البود الجديد قبل** ما يقفل القديم،
**والـ volume من نوع RWO ينفع يتركّب في نود واحدة بس** في المرة.

فلو الجديد نزل على نود تانية، **الـ volume مش قادر يتركّب**، والبود
الجديد قاعد `ContainerCreating`، **والقديم مش بيتقفل** عشان الجديد
لسه مش Ready. **قفلة.**

**وتلات حلول بترتيب الصح:**

1. **`strategy: Recreate`** — القديم بيموت الأول. **بتقبل انقطاع.**
2. **StatefulSet** — بتستبدل البودات واحد واحد، **وكل واحد شايل الـ PVC
   بتاعته**. ودي المشكلة دي محلولة صح.
3. **اسأل نفسك: التطبيق ده محتاج volume أصلاً؟** لكتير من التطبيقات
   الإجابة **object storage** أو **داتابيز مُدارة**.

**والسؤال اللي بيجي بعده:** «وطيب لو النسختين نزلوا على **نفس** النود؟»

**والإجابة بتكشف إنك عارف إن الـ RWO لكل نود مش لكل بود:** **الاتنين
هيركّبوا، والاتنين هيكتبوا، والداتابيز بكاتبين على فايل سيستم واحد
بتتخرّب.**

**وده السبب الحقيقي لوجود الـ StatefulSets.**
:::
:::

## Key takeaways

- **PVC is the request, PV is the disk, StorageClass is the recipe.** The
  indirection is what makes manifests portable.
- **`ReadWriteOnce` is per node, not per pod** — two pods on one node both
  mount it.
- **`WaitForFirstConsumer`** for zonal storage, or pods get stuck `Pending` in
  the wrong AZ.
- **`reclaimPolicy: Delete` destroys data** when the PVC goes. Use `Retain` for
  production state.
- **`allowVolumeExpansion: true`** from the start. Growing is possible;
  shrinking never is.
- **Deployments and RWO volumes deadlock.** Use `Recreate`, or a StatefulSet.
- **A retained volume is not a backup** until you have tested a restore.

:::ar الخلاصة
1. **الـ PVC طلب، والـ PV ديسك، والـ StorageClass روشتة.** والالتفاف ده
   هو اللي بيخلي ملفاتك **قابلة للنقل**.
2. **الـ `ReadWriteOnce` لكل نود مش لكل بود** — بودين على نفس النود
   **هيركّبوها الاتنين**.
3. **`WaitForFirstConsumer`** للتخزين المربوط بمنطقة، وإلا البودات
   بتتعلّق `Pending` في المنطقة الغلط.
4. **`reclaimPolicy: Delete` بيدمّر الداتا** لما الـ PVC تروح. استخدم
   `Retain` لأي حالة إنتاج.
5. **`allowVolumeExpansion: true` من البداية.** التكبير ممكن،
   **والتصغير مستحيل**.
6. **الـ Deployments والـ RWO بيتقفلوا على بعض.** استخدم `Recreate`
   أو StatefulSet.
7. **الـ volume المحفوظ مش باك أب** لحد ما **تجرّب الاسترجاع**.
:::
