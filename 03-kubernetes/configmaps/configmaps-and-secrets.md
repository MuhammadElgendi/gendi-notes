---
title: ConfigMaps and Secrets
slug: configmaps-and-secrets
type: guide
domain: 03-kubernetes
tags: [kubernetes, config, secrets]
keywords: [configmap, secret, envfrom, subpath, projected volume, immutable,
           base64, encryption at rest, external secrets, sealed secrets, rbac,
           إعدادات, أسرار, متغيرات بيئة]
level: 2
status: stable
prerequisites: [kubernetes-basics, kubernetes-pods]
related: [kubernetes-deployments, gitops, kubernetes-rbac,
          devops-interview-questions]
updated: 2026-09-13
---

# ConfigMaps and Secrets

> Both are key-value objects that decouple configuration from images. The only real difference is that a Secret is base64-encoded and handled slightly more carefully — it is **not** encrypted by default.

## What is it?

Configuration that changes between environments must not live in the image, or
you need a different image per environment and lose the "build once, promote
the same artefact" property.

| | ConfigMap | Secret |
|:---|:---|:---|
| Holds | Non-sensitive config | Passwords, tokens, keys, certs |
| Stored as | Plain text in etcd | **base64** in etcd |
| Encrypted at rest | No | **Only if you enable it** |
| Size limit | ~1 MiB | ~1 MiB |
| Shown by `kubectl get -o yaml` | Yes | Yes — base64, trivially decoded |

```sh
kubectl create configmap app-config --from-literal=LOG_LEVEL=debug
kubectl create secret generic db-creds --from-literal=password=s3cret
```

:::ar
الاتنين أوبجكتس بيخزّنوا **مفتاح = قيمة**، والغرض منهم إنك **تفصل
الإعدادات عن الصورة**.

**وليه ده مهم؟** عشان لو الإعدادات جوه الصورة، هتحتاج **صورة مختلفة لكل
بيئة** — وساعتها بتخسر قاعدة «ابني مرة واحدة ورقّي نفس الـ artifact»،
واختبارك على staging **بيبطّل يثبت حاجة** عن البرودكشن.

| | ConfigMap | Secret |
|:---|:---|:---|
| بيشيل | إعدادات **مش حساسة** | باسوردات، توكنز، مفاتيح |
| متخزّن إزاي | **نص صريح** في etcd | **base64** في etcd |
| مشفّر وهو ساكن؟ | لأ | **بس لو إنت فعّلتها** |
| الحد الأقصى | حوالي ١ ميجا | حوالي ١ ميجا |

:::danger والـ base64 **مش تشفير** — دي أهم جملة في الصفحة
الناس بتفتكر إن الـ Secret «مؤمّن» عشان شكله مش مقروء. **مش صحيح.**

```sh
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
# s3cret     ← أهو، خرج
```

الـ base64 **ترميز** عشان الداتا الثنائية تعدّي في YAML. **ومش بيخبّي حاجة
عن أي حد.**

**فالفرق الحقيقي بين ConfigMap و Secret مش التشفير.** الفرق إن الـ Secret:

- **مش بيتطبع** في وصف البود
- كوبرنيتيس **بيتعامل معاه بحذر أكتر** (مبيتخزّنش على ديسك النود، بيقعد
  في الرام)
- **وتقدر تحط عليه RBAC مختلف**

**وده كل الفرق.** والأمان الحقيقي بييجي من **الـ RBAC** ومن **التشفير
وهو ساكن** ومن **مخزن أسرار خارجي** — مش من كلمة "Secret".
:::
:::

## How to use it

### The three ways to consume them

```yaml title="deployment.yaml"
spec:
  containers:
    - name: app
      image: myapp:1.0

      # 1. ALL keys as environment variables
      envFrom:
        - configMapRef: { name: app-config }
        - secretRef:    { name: db-creds }

      # 2. ONE key, renamed — the form you want for secrets
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-creds
              key: password

      # 3. As FILES in a volume
      volumeMounts:
        - name: config
          mountPath: /etc/app        # each key becomes a file
          readOnly: true

  volumes:
    - name: config
      configMap:
        name: app-config
        items:                        # optional: pick specific keys
          - key: app.yaml
            path: application.yaml
```

### Which to choose

| Consume as | Updates live? | Use when |
|:---|:---|:---|
| `envFrom` (all keys) | **Never** | Simple config, few keys |
| `env` + `secretKeyRef` | **Never** | Secrets — you control the variable name |
| **Volume** | **Yes**, after ~60s | Config files, certs, anything reloadable |
| Volume with **`subPath`** | **No** | Mounting one file into an existing directory |

:::danger The `subPath` trap
Mounting a volume over a directory **hides everything already in it**. So to
add one config file to `/etc/nginx/`, people reach for `subPath`:

```yaml
volumeMounts:
  - name: config
    mountPath: /etc/nginx/nginx.conf
    subPath: nginx.conf        # ✔ other files in /etc/nginx survive
```

That works — and silently gives up live updates. A `subPath` mount is resolved
once at container start and **never** reflects later ConfigMap changes, unlike
a normal volume mount.

So the file that looks most like "a config file you can reload" is the one form
that cannot be. If you need both, mount the whole directory, or accept that a
change requires `kubectl rollout restart`.
:::

:::ar التلات طرق للاستخدام، وإمتى تختار أنهي واحدة
| الطريقة | بتتحدّث وهي شغالة؟ | تستخدمها لما |
|:---|:---|:---|
| `envFrom` (كل المفاتيح) | **أبداً** | إعدادات بسيطة |
| `env` + `secretKeyRef` | **أبداً** | **الأسرار** — بتتحكم في اسم المتغير |
| **volume** | **أيوه**، بعد دقيقة تقريباً | ملفات إعدادات، شهادات |
| volume بـ **`subPath`** | **لأ** | تحط ملف واحد جوه فولدر موجود |

**وليه متغيرات البيئة عمرها ما بتتحدّث؟**

عشان **بيئة العملية بتتحدد مرة واحدة وقت ما العملية تقوم**. دي حاجة في
لينكس نفسه، مش في كوبرنيتيس. فمفيش طريقة تغيّر متغير بيئة لعملية شغالة
**خالص**.

:::danger وفخ الـ `subPath`
لما تركّب volume فوق فولدر، **بتخبّي كل اللي جواه**. فعشان تضيف ملف إعداد
واحد لـ `/etc/nginx/` من غير ما تمسح الباقي، الناس بتستخدم `subPath`:

```yaml
mountPath: /etc/nginx/nginx.conf
subPath: nginx.conf        # ✔ باقي الملفات بتفضل موجودة
```

**وهي شغالة** — **وبتتنازل عن التحديث الحي في سكوت.**

الـ `subPath` بيتحسب **مرة واحدة وقت بدء الكونتينر**، **وعمره ما بيعكس
أي تغيير** في الـ ConfigMap بعد كده — عكس الـ volume العادي.

**يعني الشكل اللي أكتر حاجة شبه «ملف إعدادات تقدر تعيد تحميله» هو بالظبط
الشكل الوحيد اللي مش بيتحدّث.** خد بالك من دي.

**ولو محتاج الاتنين:** ركّب الفولدر كله، أو اقبل إن التغيير محتاج
`kubectl rollout restart`.
:::
:::

### Making a config change actually deploy

Nothing restarts a pod when a ConfigMap changes — the pod spec did not change,
so there is no new ReplicaSet and no rollout.

```sh
kubectl rollout restart deploy/web        # the quick fix
```

The durable fix is to make the config change **visible** to the Deployment:

```yaml title="Helm: a checksum annotation forces a rollout"
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

Now editing the ConfigMap changes the annotation, which changes the pod
template, which triggers a normal, observable, rollback-able rollout. Kustomize
does the same with `configMapGenerator` name suffixes.

:::key Prefer immutable ConfigMaps
```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config-v2 }
immutable: true
data: { LOG_LEVEL: info }
```

An immutable ConfigMap cannot be edited — you create a new one and point the
Deployment at it. That makes every config change a **versioned, rolled-out,
revertible** change instead of an invisible mutation, and it lets the kubelet
stop watching the object, which meaningfully reduces API server load on large
clusters.
:::

## Making Secrets actually secret

A Secret alone gives you very little. Four things are needed:

| Control | What it does | Without it |
|:---|:---|:---|
| **RBAC** | Restrict who can `get` Secrets | Any developer reads production passwords |
| **Encryption at rest** | `EncryptionConfiguration` on the API server | Anyone with etcd access or a backup reads everything |
| **External secret store** | Vault / AWS SM / GCP SM via External Secrets | Rotation means a commit; secrets live in Git |
| **No secrets in env vars** | Prefer files | Env leaks into crash dumps, `/proc`, logs, child processes |

```sh
# Who can read Secrets in this namespace? Run this on your own cluster.
kubectl auth can-i get secrets --as=system:serviceaccount:prod:default -n prod
kubectl get rolebindings,clusterrolebindings -A -o wide | grep -i secret
```

:::danger Any pod can read any Secret mounted into it — and so can its ServiceAccount
Two exposures people miss:

1. **A Secret in an environment variable is visible to the whole process tree.**
   It appears in `/proc/<pid>/environ`, in crash dumps, in many APM agents, and
   in anything that logs its environment on startup. Files are better: a file
   has permissions, and it does not get inherited by every subprocess.

2. **`kubectl get secrets` is governed by RBAC, but so is every ServiceAccount.**
   A pod whose ServiceAccount can list Secrets in its namespace can read *all*
   of them, not just its own. Default ServiceAccounts should not have that, and
   frequently do in clusters where someone bound `edit` or `cluster-admin`
   broadly.
:::

:::ar خلّي الـ Secret سر فعلاً
الـ Secret لوحده **مش بيديك حاجة تقريباً**. محتاج ٤ حاجات:

| الضابط | بيعمل إيه | من غيره |
|:---|:---|:---|
| **RBAC** | يحدد مين يقرا الـ Secrets | **أي مطوّر بيقرا باسوردات البرودكشن** |
| **التشفير وهو ساكن** | إعداد على الـ API server | أي حد يوصل etcd أو باك أب **بيقرا كل حاجة** |
| **مخزن أسرار خارجي** | Vault أو AWS SM | التغيير الدوري بيبقى commit |
| **بلاش أسرار في متغيرات البيئة** | استخدم ملفات | البيئة بتتسرّب في أماكن كتير |

:::danger وحاجتين الناس بتنساهم
**١. السر في متغير بيئة مكشوف لشجرة العمليات كلها.**

هو بيظهر في `/proc/<pid>/environ`، وفي الـ crash dumps، وفي كتير من أدوات
المراقبة، **وفي أي برنامج بيطبع بيئته وهو بيقوم**.

**والملف أحسن**، عشان الملف **ليه صلاحيات**، **ومش بيتورّث لكل عملية
فرعية**.

**٢. أي بود يقدر يقرا أي Secret متركّب فيه — وكمان الـ ServiceAccount بتاعه.**

البود اللي الـ ServiceAccount بتاعه من حقه يعمل `list` للـ Secrets في
الـ namespace، **يقدر يقرا كلهم**، مش بتاعه هو بس.

**والافتراضي المفروض ما يكونش كده** — بس ده بيحصل كتير في كلاسترات حد
ربط فيها `edit` أو `cluster-admin` بشكل واسع.

**اتأكد بنفسك دلوقتي:**

```sh
kubectl auth can-i get secrets --as=system:serviceaccount:prod:default -n prod
```
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| Pod `CreateContainerConfigError` | Referenced ConfigMap/Secret does not exist | `kubectl describe pod`; check the name and namespace |
| Config change has no effect | Env vars never update | `kubectl rollout restart`, or a checksum annotation |
| Volume change has no effect | Mounted with `subPath` | Mount the directory instead |
| `key not found` | Key name mismatch, or wrong `items` | `kubectl get cm x -o yaml` |
| Secret works in one namespace, not another | They are **namespaced** | Create it in each namespace |
| Pod cannot pull an image | `imagePullSecrets` missing or in the wrong namespace | Check the ServiceAccount and namespace |
| `data` too large | ~1 MiB etcd limit | Use a volume, an init container, or object storage |

:::warn ConfigMaps and Secrets are namespaced, and that surprises people
There is no cluster-wide Secret. A pod can only reference one in **its own
namespace**, so a shared TLS certificate or registry credential must be copied
into every namespace that needs it.

Copying by hand drifts immediately. Use a replicator (Reflector, kubed) or
External Secrets, which creates the Secret per namespace from one upstream
source.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| `CreateContainerConfigError` | الـ ConfigMap/Secret **مش موجود** | `describe pod` وشيك الاسم والـ namespace |
| التغيير مالوش أثر | متغيرات البيئة **عمرها ما بتتحدّث** | `rollout restart` أو checksum |
| تغيير الـ volume مالوش أثر | متركّب بـ `subPath` | ركّب الفولدر بدله |
| شغّال في namespace وفاشل في تانية | **الاتنين namespaced** | اعمله في كل namespace |
| البود مش قادر ينزّل الصورة | `imagePullSecrets` ناقصة | شيك الـ ServiceAccount |
| `data` كبيرة أوي | حد etcd حوالي ١ ميجا | volume أو init container |

:::warn والـ namespacing ده بيفاجئ الناس
**مفيش حاجة اسمها Secret على مستوى الكلاستر.** البود **مش بيقدر** يشاور
على حاجة غير في **الـ namespace بتاعته هو**.

فشهادة TLS مشتركة، أو صلاحية registry، **لازم تتنسخ في كل namespace
محتاجاها**.

**والنسخ بالإيد بينحرف فوراً** — حد بيغيّر واحدة وبينسى الباقي.

**الحل:** أداة نسخ (Reflector أو kubed)، أو **External Secrets** اللي
بتعمل الـ Secret في كل namespace **من مصدر واحد**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Is a Kubernetes Secret encrypted? · الـ Secret مشفّر؟
**No, not by default.** It is base64-encoded, which is an encoding, not a
cipher:

```sh
kubectl get secret db -o jsonpath='{.data.password}' | base64 -d
```

By default it is stored in **plain text in etcd**. So anyone who can read etcd,
or an etcd backup, or an EBS snapshot of the etcd volume, has every secret in
the cluster.

**What actually makes it a secret — four layers:**

1. **RBAC**, so only the right identities can `get` it.
2. **Encryption at rest**, via an `EncryptionConfiguration` on the API server,
   ideally with a KMS provider rather than a local key.
3. **An external store** — Vault, AWS Secrets Manager — with External Secrets,
   so rotation happens outside the cluster and outside Git.
4. **Mount as files, not environment variables**, because env is visible to the
   whole process tree and leaks into crash dumps and logs.

:::key The distinction that scores
The real difference between a ConfigMap and a Secret is **not** encryption. It
is that Secrets are excluded from some outputs, kept in tmpfs on the node
rather than written to disk, and can be given separate RBAC. Saying that shows
you have read how it works rather than assuming from the name.
:::

:::ar
**لأ، مش افتراضياً.** هو **base64**، وده **ترميز مش تشفير**:

```sh
kubectl get secret db -o jsonpath='{.data.password}' | base64 -d
```

وافتراضياً هو متخزّن **نص صريح في etcd**. يعني أي حد يقرا etcd، أو **باك
أب** بتاعها، أو **snapshot للديسك**، **معاه كل أسرار الكلاستر**.

**واللي بيخليه سر فعلاً ٤ طبقات:**

1. **RBAC** — مين من حقه يقراه.
2. **تشفير وهو ساكن** على الـ API server، ويفضّل مع **KMS** مش مفتاح محلي.
3. **مخزن خارجي** (Vault) مع External Secrets، فالتغيير الدوري بيحصل
   **بره الكلاستر وبره Git**.
4. **ركّبه كملف مش متغير بيئة**.

**والفرق اللي بياخد الدرجة:**

الفرق الحقيقي بين ConfigMap و Secret **مش التشفير**. الفرق إن الـ Secret
**بيتستثنى من بعض المخرجات**، **وبيتخزّن في الرام على النود مش على
الديسك**، **وبتقدر تديله RBAC مستقل**.

وإنك تقول ده بيوري إنك **قريت إزاي بيشتغل**، مش بتفترض من الاسم.
:::
:::

:::q You update a ConfigMap. Which consumers see the change, and when?
Depends entirely on how it is mounted — and this is a table worth knowing cold:

| Mounted as | Sees the update? | Why |
|:---|:---|:---|
| `env` / `envFrom` | **Never** | A process's environment is fixed at exec time. This is a Linux property, not a Kubernetes one |
| Volume | **Yes**, after up to ~60s | The kubelet syncs the projected files periodically |
| Volume with `subPath` | **Never** | Resolved once at container start |
| Immutable ConfigMap | N/A — it cannot be edited | You create a new object and roll |

**And even for volumes, "the file changed" is not "the app reloaded."** Your
application must watch the file or handle `SIGHUP`. nginx and Envoy do;
most application code does not.

**So the reliable answer is to trigger a rollout:**

```sh
kubectl rollout restart deploy/web
```

and the durable one is a checksum annotation on the pod template, so a config
change becomes an ordinary, observable, revertible deploy.

:::ar
بيعتمد بالكامل على **إزاي ركّبته** — والجدول ده تحفظه:

| مركّب إزاي | بيشوف التغيير؟ | ليه |
|:---|:---|:---|
| `env` / `envFrom` | **أبداً** | بيئة العملية بتتحدد **وقت التشغيل**. دي خاصية لينكس، مش كوبرنيتيس |
| volume | **أيوه**، خلال دقيقة | الـ kubelet بيزامن الملفات |
| volume بـ `subPath` | **أبداً** | بيتحسب مرة واحدة وقت البدء |
| ConfigMap ثابت | مالهاش لازمة — **مش بيتعدّل** | تعمل واحد جديد وتنشر |

**وحتى مع الـ volume، «الملف اتغير» مش معناها «التطبيق قرأه».**

تطبيقك لازم **يراقب الملف** أو يتعامل مع `SIGHUP`. و nginx و Envoy
بيعملوا كده، **وأغلب كود التطبيقات لأ**.

**فالإجابة الموثوقة إنك تعمل rollout:**

```sh
kubectl rollout restart deploy/web
```

**والإجابة الدايمة** هي **checksum annotation** على الـ pod template،
عشان تغيير الإعدادات يبقى **ديبلوي عادي، تشوفه وترجع منه**.
:::
:::

## Key takeaways

- **A Secret is base64, not encrypted.** Security comes from RBAC, encryption
  at rest, and an external store — not from the object type.
- **Environment variables never update.** Only volume mounts do, and not with
  `subPath`.
- **Nothing restarts a pod on a config change** — use a checksum annotation, or
  `rollout restart`.
- **`subPath` silently disables live updates**, which is exactly the case where
  you expected them.
- **Prefer files over env vars for secrets** — env is visible to the whole
  process tree.
- **Both are namespaced.** Shared certs and registry credentials need
  replication.
- **Immutable ConfigMaps** turn config into versioned, revertible deploys.

:::ar الخلاصة
1. **الـ Secret ترميز base64، مش تشفير.** الأمان بييجي من **RBAC**
   و**التشفير وهو ساكن** و**مخزن خارجي** — مش من نوع الأوبجكت.
2. **متغيرات البيئة عمرها ما بتتحدّث.** الـ volumes بس، **وبشرط مفيش
   `subPath`**.
3. **مفيش حاجة بتعمل restart لما الإعدادات تتغير** — استخدم checksum
   annotation أو `rollout restart`.
4. **الـ `subPath` بيلغي التحديث الحي في سكوت** — وده بالظبط المكان اللي
   إنت متوقّعه فيه.
5. **للأسرار، ملفات أحسن من متغيرات بيئة** — البيئة مكشوفة لشجرة العمليات.
6. **الاتنين namespaced.** الشهادات المشتركة محتاجة نسخ.
7. **الـ ConfigMaps الثابتة** بتحوّل الإعدادات لنشر **مُصدَّر وقابل للرجوع**.
:::
