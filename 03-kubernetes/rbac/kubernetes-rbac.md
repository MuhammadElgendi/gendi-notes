---
title: Kubernetes RBAC
slug: kubernetes-rbac
type: guide
domain: 03-kubernetes
tags: [kubernetes, rbac, security]
keywords: [role, clusterrole, rolebinding, clusterrolebinding, serviceaccount,
           verbs, subjects, aggregation, escalate, impersonate, can-i, oidc,
           صلاحيات, أدوار, أمان, تصاريح]
level: 3
status: stable
prerequisites: [kubernetes-architecture]
related: [kubernetes-architecture, configmaps-and-secrets,
          kubernetes-troubleshooting, devops-interview-questions]
updated: 2026-09-13
---

# Kubernetes RBAC

> Four object types and one rule: permissions are **purely additive**, there is no deny. If someone can do something they should not, you remove a binding — you cannot add a rule to stop them.

## What is it?

RBAC answers the **authorization** question — the second gate in the API
server, after authentication has established who you are.

```diagram
   request ──→ ① AUTHN  "you are alice@example.com"
                  │
                  ↓
               ② AUTHZ  "may alice CREATE PODS in namespace prod?"   ← RBAC
                  │      checks every Role bound to her.
                  │      ANY rule that allows it → allowed.
                  │      No rule allows it       → 403.
                  ↓
               ③ ADMISSION  →  ④ VALIDATION  →  etcd
```

:::ar
الـ RBAC بيجاوب على سؤال **الصلاحيات** — وهي **البوابة التانية** في الـ
API server، بعد ما الهوية تتأكد.

يعني الترتيب: **مين إنت؟** (authentication) ← **من حقك تعمل كده؟**
(authorization = RBAC) ← admission ← تحقّق ← كتابة.

**والقاعدة الوحيدة اللي لازم تحفظها:**

> **الصلاحيات بتتجمع بس. مفيش حاجة اسمها «امنع».**

يعني كوبرنيتيس بيبص على **كل** الأدوار المربوطة بيك، **ولو أي قاعدة
فيهم بتسمح بالحاجة دي، خلاص اتسمحت**.

**ومفيش أي طريقة تكتب قاعدة «امنع alice من مسح البودات»**. لو alice
بتقدر تمسح، يبقى فيه **ربط** بيديها الصلاحية دي — **وإنت بتشيل الربط**،
مش بتضيف منع.

**والفرق ده جوهري** ومختلف عن أنظمة صلاحيات تانية (زي IAM في AWS اللي
فيها `Deny` صريح بيغلب). فلو جاي من هناك، **خد بالك**.
:::

## What it is made of

Four objects, and the only real complexity is the two-by-two grid.

| Object | Defines | Scope |
|:---|:---|:---|
| **Role** | *What* may be done | One namespace |
| **ClusterRole** | *What* may be done | Cluster-wide, or cluster-scoped resources |
| **RoleBinding** | *Who* gets a role | One namespace |
| **ClusterRoleBinding** | *Who* gets a role | Cluster-wide |

```diagram
                    Role (namespaced)      ClusterRole (cluster-wide)
                    ─────────────────      ──────────────────────────
   RoleBinding      permissions in         permissions in THAT ONE
   (namespaced)     that namespace         namespace only
                                           ← the useful combination

   ClusterRole      ✘ not allowed          permissions in EVERY
   Binding          (cannot widen a        namespace, plus cluster-
   (cluster-wide)    namespaced Role)      scoped resources
                                           ← the dangerous one
```

:::key The combination people miss
**A RoleBinding can reference a ClusterRole**, and that is usually what you
want: define the permission set **once**, grant it **per namespace**.

```yaml
# The built-in "edit" ClusterRole, granted only in namespace "dev"
kind: RoleBinding
roleRef:  { kind: ClusterRole, name: edit }   # defined once, cluster-wide
subjects: [{ kind: Group, name: developers }]
```

The reverse is impossible: a ClusterRoleBinding cannot reference a namespaced
Role, because you cannot widen a namespaced definition to the whole cluster.
:::

:::ar المكوّنات الأربعة
| الأوبجكت | بيحدد | نطاقه |
|:---|:---|:---|
| **Role** | **إيه** المسموح | namespace واحدة |
| **ClusterRole** | **إيه** المسموح | الكلاستر كله |
| **RoleBinding** | **مين** ياخد الدور | namespace واحدة |
| **ClusterRoleBinding** | **مين** ياخد الدور | الكلاستر كله |

**فكّر فيها كده:** الـ **Role** بيقول «إيه»، والـ **Binding** بيقول «مين».
وكل واحد منهم له نسخة محلية ونسخة على مستوى الكلاستر.

:::key والتركيبة اللي الناس بتفوّتها
**الـ RoleBinding يقدر يشاور على ClusterRole** — **وغالباً دي اللي إنت
عايزها**.

يعني: **تعرّف مجموعة الصلاحيات مرة واحدة**، وتديها **لكل namespace على
حدة**.

```yaml
kind: RoleBinding          # ← محلي
roleRef:
  kind: ClusterRole        # ← بس بيشاور على تعريف عام
  name: edit
```

**والعكس مستحيل:** الـ ClusterRoleBinding **مش** بيقدر يشاور على Role
محلي — **عشان مينفعش توسّع تعريف محلي للكلاستر كله**. منطقي.
:::
:::

## How to use it

### A Role and a binding

```yaml title="Read-only access to pods and their logs, in one namespace"
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
  - apiGroups: [""]                 # "" is the CORE group: pods, services...
    resources: ["pods", "pods/log"] # subresources are separate. This matters.
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: production
  name: devs-read-pods
subjects:
  - kind: User
    name: alice@example.com         # from your identity provider
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: ci-deployer
    namespace: ci                   # a SA from ANOTHER namespace is allowed
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

| Field | Gotcha |
|:---|:---|
| `apiGroups: [""]` | The **core** group. Pods, Services, ConfigMaps, Secrets, Nodes |
| `resources` | **Plural**, lowercase: `pods` not `Pod` |
| `pods/log`, `pods/exec` | **Subresources are separate permissions** |
| `verbs` | `get list watch create update patch delete deletecollection` |
| `kind: User` | Kubernetes has **no user objects** — these come from your IdP |

:::warn `get` does not imply `list`, and `list` leaks contents
Two independent traps in the same place.

**`get` and `list` are separate verbs.** A dashboard that "can get pods" but
cannot `list` them shows nothing, because listing is what populates the view.
Grant `get`, `list` **and** `watch` together for anything read-only.

**And `list` returns full objects, not names.** Granting `list` on secrets is
granting `get` on every secret in scope. There is no "list the names only"
permission — if they can list, they can read.
:::

:::ar الأفعال والموارد — والفخاخ
| الحقل | الفخ |
|:---|:---|
| `apiGroups: [""]` | دي المجموعة **الأساسية**: pods، services، secrets |
| `resources` | **جمع وحروف صغيرة**: `pods` مش `Pod` |
| `pods/log`، `pods/exec` | **الموارد الفرعية صلاحيات منفصلة** |
| `kind: User` | **كوبرنيتيس مفيهوش يوزرز أصلاً** — دول جايين من مزوّد الهوية بتاعك |

**والنقطة الأخيرة دي بتصدم الناس:** مفيش `kubectl create user`. كوبرنيتيس
**مش** بيخزّن مستخدمين. هو بس **بيثق** في شهادة أو توكن أو OIDC، وبياخد
الاسم منهم.

:::danger و `get` **مش** بتشمل `list`، والـ `list` **بتسرّب المحتوى**
فخين في نفس المكان:

**١. `get` و `list` فعلين منفصلين تماماً.**

فداشبورد «بيقدر يعمل get للبودات» بس **مش قادر يعمل list**، **مش هيعرض
أي حاجة** — عشان الـ `list` هي اللي بتملا الشاشة.

فللقراءة، إدي **`get` و `list` و `watch`** مع بعض دايماً.

**٢. والـ `list` بترجّع الأوبجكتس كاملة، مش الأسماء بس.**

يعني إنك تدي `list` على الـ secrets = إنك إديت `get` على **كل secret**
في النطاق ده.

**ومفيش صلاحية اسمها «اعرض الأسماء بس».** لو يقدر يعمل list، **يبقى
يقدر يقرا**. خد بالك من دي وإنت بتكتب أدوار للمراقبة.
:::
:::

### ServiceAccounts — identity for pods

Every pod runs as a ServiceAccount. If you do not name one, it is `default`.

```yaml
spec:
  serviceAccountName: my-app
  automountServiceAccountToken: false     # if the app never calls the API
```

```sh
kubectl create serviceaccount my-app -n prod
kubectl create rolebinding my-app-reader \
  --role=pod-reader --serviceaccount=prod:my-app -n prod
```

:::key Turn off token automounting for apps that do not need it
By default Kubernetes mounts a ServiceAccount token into **every** pod at
`/var/run/secrets/kubernetes.io/serviceaccount/token`.

Most applications never call the Kubernetes API. For them that token is pure
downside: anyone who achieves code execution in the container gets a cluster
credential for free, and can start enumerating what it can reach.

Set `automountServiceAccountToken: false` on the ServiceAccount or the pod.
It is a one-line change that removes an entire escalation path.
:::

### Testing permissions — the commands that actually answer the question

```sh
# Can I?
kubectl auth can-i create deployments -n prod

# Can SOMEONE ELSE? (needs impersonation rights)
kubectl auth can-i delete pods -n prod --as=alice@example.com
kubectl auth can-i '*' '*' --as=system:serviceaccount:prod:default

# Everything a subject can do — the review command
kubectl auth can-i --list --as=system:serviceaccount:prod:my-app -n prod

# Who has cluster-admin? Run this on your cluster today.
kubectl get clusterrolebindings -o json | jq -r '
  .items[] | select(.roleRef.name=="cluster-admin")
  | .metadata.name + " -> " + ([.subjects[]?.name] | join(", "))'
```

:::ar الـ ServiceAccounts وفحص الصلاحيات
**كل بود بيشتغل بهوية اسمها ServiceAccount.** ولو ما حددتش واحدة،
بياخد `default`.

:::key اقفل الـ token للتطبيقات اللي مش محتاجاه
كوبرنيتيس افتراضياً **بيركّب توكن في كل بود** على المسار:
`/var/run/secrets/kubernetes.io/serviceaccount/token`

**وأغلب التطبيقات عمرها ما بتكلّم الـ API بتاع كوبرنيتيس.**

فبالنسبالهم التوكن ده **خسارة صافية**: أي حد ينجح ينفّذ كود في الكونتينر
**بياخد صلاحية كلاستر ببلاش**، ويبدأ يشوف يقدر يوصل لإيه.

```yaml
automountServiceAccountToken: false
```

**سطر واحد بيقفل مسار تصعيد كامل.**

**والأوامر اللي بتجاوب فعلاً:**

```sh
kubectl auth can-i create deployments -n prod          # أنا أقدر؟
kubectl auth can-i --list --as=system:serviceaccount:prod:my-app -n prod
```

**والأمر التاني ده أهم أمر في الصفحة** — بيعرضلك **كل حاجة** الهوية دي
تقدر تعملها. **شغّله على الـ `default` ServiceAccount في البرودكشن
النهاردة** وشوف هتتفاجئ ولا لأ.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `403 forbidden` and the message names the missing verb | No rule allows it | `kubectl auth can-i --list`; add a rule |
| Read-only dashboard shows nothing | `get` without `list` | Grant `get`, `list`, `watch` |
| `cannot get resource "pods/log"` | Subresource not granted | Add `pods/log` explicitly |
| Binding exists but has no effect | Wrong namespace, or a typo in `roleRef` | `roleRef` is **immutable** — delete and recreate |
| Works for you, fails in CI | You are admin; the ServiceAccount is not | `--as=system:serviceaccount:<ns>:<name>` |
| `attempt to grant extra privileges` | You cannot grant what you do not have | Escalation prevention — see below |

:::danger `cluster-admin` on a ServiceAccount is how clusters get owned
The most common real-world escalation is not exotic. It is:

```diagram
   a pod runs with a ServiceAccount bound to cluster-admin
        │
        │  attacker gets code execution in that pod
        ↓
   reads /var/run/secrets/.../token
        │
        ↓
   that token IS cluster-admin
        │
        ├── read every Secret in the cluster
        ├── create a privileged pod mounting the host filesystem
        └── from there, the node — and then every node
```

Audit it now:

```sh
kubectl get clusterrolebindings -o wide | grep cluster-admin
```

Anything in that list that is a ServiceAccount deserves a written
justification. Most were granted to "make it work" during an incident and never
narrowed afterwards.
:::

:::warn Privilege escalation prevention will block *you*
You cannot create a Role granting permissions you do not hold — otherwise any
user with `create role` would be cluster-admin in two steps.

```text
Error: user "alice" is attempting to grant extra privileges
```

This is RBAC working. Legitimate paths: be granted the permission yourself
first, or hold the `escalate` verb on roles (which should be rare and
deliberate).
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| `403` والرسالة بتسمّي الفعل الناقص | مفيش قاعدة بتسمح | `auth can-i --list` وضيف قاعدة |
| داشبورد قراءة مش بيعرض حاجة | `get` من غير `list` | إدي التلاتة |
| `cannot get "pods/log"` | المورد الفرعي مش مسموح | ضيف `pods/log` صريح |
| الربط موجود ومش شغّال | namespace غلط، أو غلطة في `roleRef` | **الـ `roleRef` ثابت** — امسح واعمل من الأول |
| شغّال معاك وفاشل في الـ CI | **إنت admin، والـ SA لأ** | جرّب بـ `--as=` |

:::danger و `cluster-admin` على ServiceAccount هي إزاي الكلاسترات بتتخترق
أشهر تصعيد صلاحيات في الواقع **مش معقّد خالص**:

```diagram
   بود شغّال بـ ServiceAccount مربوطة بـ cluster-admin
        │
        │  مهاجم ينجح ينفّذ كود في البود
        ↓
   يقرا /var/run/secrets/.../token
        │
        ↓
   التوكن ده **هو** cluster-admin
        │
        ├── يقرا كل Secret في الكلاستر
        ├── يعمل بود privileged بيركّب فايل سيستم النود
        └── ومن هنا، النود — وبعدين كل النودات
```

**راجعها دلوقتي:**

```sh
kubectl get clusterrolebindings -o wide | grep cluster-admin
```

**أي ServiceAccount في اللستة دي محتاجة مبرر مكتوب.**

وأغلبهم اتعملوا عشان «نخلي الحاجة تشتغل» وقت أزمة، **ومحدش ضيّقهم بعد كده**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is the difference between a Role and a ClusterRole, and when do you combine them?
**Role is namespaced; ClusterRole is cluster-wide.** The binding determines the
*effective* scope, which is where the useful combination lives.

| Role kind | Binding kind | Effective scope |
|:---|:---|:---|
| Role | RoleBinding | That one namespace |
| **ClusterRole** | **RoleBinding** | **That one namespace** — the pattern you want |
| ClusterRole | ClusterRoleBinding | Every namespace, plus cluster-scoped resources |
| Role | ClusterRoleBinding | **Impossible** |

**Use a ClusterRole with a RoleBinding** to define a permission set once and
grant it per namespace — that is how the built-in `view`, `edit` and `admin`
roles are meant to be used.

**You need a ClusterRole with a ClusterRoleBinding** for genuinely
cluster-scoped resources: nodes, PersistentVolumes, namespaces,
CustomResourceDefinitions. Those have no namespace, so a RoleBinding cannot
express permission over them.

:::ar
**الـ Role محلي، والـ ClusterRole على مستوى الكلاستر.** **والـ binding
هو اللي بيحدد النطاق الفعلي** — وهنا التركيبة المفيدة.

| نوع الدور | نوع الربط | النطاق الفعلي |
|:---|:---|:---|
| Role | RoleBinding | الـ namespace دي بس |
| **ClusterRole** | **RoleBinding** | **الـ namespace دي بس** ← النمط المطلوب |
| ClusterRole | ClusterRoleBinding | **كل** الـ namespaces + موارد الكلاستر |
| Role | ClusterRoleBinding | **مستحيل** |

**استخدم ClusterRole مع RoleBinding** عشان تعرّف الصلاحيات **مرة واحدة**
وتديها **لكل namespace** — وكده الأدوار الجاهزة `view` و `edit` و `admin`
**المفروض** تتستخدم.

**ومحتاج ClusterRoleBinding** للموارد اللي **مالهاش namespace** أصلاً:
النودات، والـ PersistentVolumes، والـ namespaces نفسها، والـ CRDs.
دي **مفيش RoleBinding يقدر يعبّر عن صلاحية عليها**.
:::
:::

:::q How would you debug a `403 Forbidden` from a pod's application?
The pod acts as its ServiceAccount, so reproduce it **as that identity** rather
than as yourself — that is the whole trick.

```sh
# 1. Which ServiceAccount is it actually using?
kubectl get pod <pod> -n prod -o jsonpath='{.spec.serviceAccountName}{"\n"}'

# 2. Ask the API server directly, as that identity
kubectl auth can-i list configmaps \
  --as=system:serviceaccount:prod:my-app -n prod

# 3. Everything it CAN do — usually the fastest way to spot the gap
kubectl auth can-i --list --as=system:serviceaccount:prod:my-app -n prod

# 4. Which bindings actually reference it?
kubectl get rolebindings,clusterrolebindings -A -o json | jq -r '
  .items[] | select(.subjects[]?.name=="my-app") | .metadata.name'
```

**Read the 403 message itself** — Kubernetes names the verb, resource, API
group and namespace it wanted. That usually identifies the missing rule
immediately.

Common causes, in order: wrong namespace in the RoleBinding; a missing
subresource like `pods/log`; `get` granted without `list`; the pod using
`default` because `serviceAccountName` was never set.

:::key The instinct being tested
Whether you test **as the failing identity** instead of as yourself. "It works
when I run it" is meaningless here — you are cluster-admin and the workload
is not. A candidate who reaches for `--as=` has debugged RBAC before.
:::

:::ar
البود بيتصرّف بهوية الـ ServiceAccount بتاعته، **فاختبر بالهوية دي**،
مش بهويتك إنت. **ودي كل الحكاية.**

```sh
kubectl get pod <pod> -o jsonpath='{.spec.serviceAccountName}{"\n"}'   # ١. بأنهي SA؟
kubectl auth can-i list configmaps --as=system:serviceaccount:prod:my-app -n prod
kubectl auth can-i --list --as=system:serviceaccount:prod:my-app -n prod  # ٣. الأنفع
```

**واقرا رسالة الـ 403 نفسها** — كوبرنيتيس **بيسمّي الفعل والمورد
والمجموعة والـ namespace** اللي كان عايزهم. ودي غالباً بتحدد القاعدة
الناقصة **فوراً**.

**والأسباب المعتادة بالترتيب:** namespace غلط في الـ RoleBinding، أو
مورد فرعي ناقص زي `pods/log`، أو `get` من غير `list`، أو البود شغّال
بـ `default` عشان محدش حدد `serviceAccountName`.

**واللي بيتقاس عليه:** إنك **تختبر بالهوية الفاشلة** مش بهويتك.

**«هي شغالة لما أنا بشغّلها» مالهاش أي معنى هنا** — إنت `cluster-admin`
والتطبيق لأ. واللي بيمد إيده على `--as=` ده **ظبّط RBAC قبل كده فعلاً**.
:::
:::

:::q There is no "deny" rule in RBAC. What are the consequences?
RBAC is **purely additive**: the API server evaluates every rule bound to the
subject, and allows the request if **any** rule permits it. There is no way to
subtract.

Four practical consequences:

1. **To remove access you remove a binding**, not add a rule. So you must be
   able to find every binding that grants it — which is why broad
   ClusterRoleBindings are dangerous: they are easy to add and hard to audit.
2. **A wildcard is unrecoverable except by deletion.** `verbs: ["*"]` on
   `resources: ["*"]` cannot be narrowed by a second rule.
3. **Auditing means enumerating**, so `kubectl auth can-i --list --as=...` is
   the only reliable answer to "what can this identity do?" Reading individual
   Roles will mislead you.
4. **For real deny semantics you need admission control** — a validating
   webhook, OPA Gatekeeper or Kyverno — because that stage *can* reject. RBAC
   answers "may you", admission answers "should this specific object be
   allowed".

:::key
The mature framing: RBAC is coarse authorization, and policy engines are where
nuanced rules belong ("no container may run as root", "images must come from
our registry"). Trying to express those in RBAC is a category error, and
recognising that is the senior signal.
:::

:::ar
الـ RBAC **تجميعي بحت**: الـ API server بيقيّم **كل** القواعد المربوطة
بالهوية، **ولو أي واحدة سمحت، اتسمح**. **مفيش طرح.**

**وأربع نتايج عملية:**

**١. عشان تشيل صلاحية، بتشيل ربط** — مش بتضيف قاعدة. يعني لازم تكون
قادر **تلاقي كل ربط** بيديها. **وعشان كده الـ ClusterRoleBindings الواسعة
خطيرة**: سهلة الإضافة، **صعبة المراجعة**.

**٢. الـ wildcard مالهوش رجعة غير بالمسح.** `verbs: ["*"]` على
`resources: ["*"]` **مفيش قاعدة تانية تقدر تضيّقها**.

**٣. المراجعة = تعداد.** فـ `kubectl auth can-i --list --as=...` هو
**الإجابة الموثوقة الوحيدة** لسؤال «الهوية دي تقدر تعمل إيه؟». وقراءة
الأدوار واحد واحد **هتضللك**.

**٤. وللمنع الحقيقي إنت محتاج admission control** — webhook، أو OPA
Gatekeeper، أو Kyverno — **عشان المرحلة دي هي اللي بتقدر ترفض**.

**والصياغة الناضجة:** الـ RBAC **تصريح خشن**، ومحركات السياسات هي مكان
القواعد الدقيقة («ممنوع كونتينر يشتغل كـ root»، «الصور لازم تيجي من
الـ registry بتاعنا»).

**وإنك تحاول تعبّر عن دي في RBAC غلطة في التصنيف نفسه** — وإنك تعرف ده
هي **إشارة السينيورتي** في السؤال.
:::
:::

## Key takeaways

- **Permissions are additive; there is no deny.** Remove bindings, do not add
  rules.
- **A RoleBinding referencing a ClusterRole** is the pattern: define once,
  grant per namespace.
- **`get` does not imply `list`**, and `list` returns full objects — so `list`
  on secrets is `get` on all of them.
- **Subresources are separate**: `pods/log`, `pods/exec`, `pods/portforward`.
- **Test as the failing identity** with `--as=`, never as yourself.
- **`automountServiceAccountToken: false`** for apps that never call the API.
- **Audit `cluster-admin` bindings** — a ServiceAccount with it turns any code
  execution into cluster compromise.
- **Nuanced policy belongs in admission control**, not RBAC.

:::ar الخلاصة
1. **الصلاحيات بتتجمع، ومفيش منع.** **شيل الربط**، متضفش قاعدة.
2. **RoleBinding بيشاور على ClusterRole** هو النمط: **عرّف مرة، وادي
   لكل namespace**.
3. **`get` مش بتشمل `list`**، والـ `list` بترجّع الأوبجكت كامل —
   **فـ `list` على الـ secrets = `get` عليهم كلهم**.
4. **الموارد الفرعية منفصلة**: `pods/log` و `pods/exec`.
5. **اختبر بالهوية الفاشلة** بـ `--as=`، مش بهويتك إنت.
6. **`automountServiceAccountToken: false`** لأي تطبيق مش بيكلّم الـ API.
7. **راجع ربط `cluster-admin`** — ServiceAccount معاها بتحوّل أي تنفيذ
   كود **لاختراق كامل للكلاستر**.
8. **السياسات الدقيقة مكانها admission control**، مش RBAC.
:::
