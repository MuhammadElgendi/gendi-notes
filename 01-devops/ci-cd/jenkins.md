---
title: Jenkins
slug: jenkins
type: guide
domain: 01-devops
tags: [jenkins, ci-cd, automation]
keywords: [jenkinsfile, declarative pipeline, scripted, agent, controller,
           shared library, multibranch, plugin, groovy, credentials, executor,
           جينكينز, بايبلاين, أتمتة, بناء]
level: 2
status: stable
prerequisites: [ci-cd, git, docker]
related: [ci-cd, gitops, docker-images, devops-interview-questions]
updated: 2026-09-13
---

# Jenkins

> Jenkins is a job runner with an enormous plugin ecosystem — which is both why it survives everywhere and why every neglected Jenkins becomes a liability.

## What is it?

Jenkins runs automation jobs on a schedule or a trigger. A **controller**
schedules work and stores configuration; **agents** execute it. The job itself
is a `Jenkinsfile` committed alongside your code.

```diagram
   git push / webhook / cron / manual
        │
        ↓
   ┌──────────────────┐        assigns work
   │   CONTROLLER     │ ─────────────────────┐
   │  · schedules     │                      ↓
   │  · stores config │            ┌──────────────────┐
   │  · serves the UI │            │  AGENT (node)    │
   │  · NEVER builds  │ ←──────────│  runs the stages │
   └──────────────────┘   results  │  has the tools   │
                                   └──────────────────┘
                                   static VM · Docker · Kubernetes pod
```

:::ar
Jenkins برنامج بيشغّل مهام أتمتة — بجدول زمني، أو لما حاجة تحصل (زي
`git push`).

**وهو مقسوم نصين، والتقسيمة دي أهم حاجة تفهمها من الأول:**

| الجزء | شغلته | المفروض يعمل إيه |
|:---|:---|:---|
| **Controller** | بيجدول الشغل، بيخزّن الإعدادات، بيعرض الواجهة | **عمره ما يبني حاجة** |
| **Agent** | بينفّذ الخطوات فعلاً | هو اللي شايل الأدوات |

**وليه الـ controller ممنوع يبني؟**

عشان الـ build بيشغّل **كود جاي من الريبو**. ولو ده حصل على الـ controller،
فالكود ده بقى على الجهاز اللي فيه **كل إعداداتك وكل أسرارك وصلاحياتك**.

**ودي أول حاجة بتتشاف في أي مراجعة أمنية لـ Jenkins.** لو الـ controller
عنده executors أكتر من صفر، ده **عيب أمني** مش مجرد مشكلة أداء.

والـ **Jenkinsfile** هو الملف اللي بيوصف الشغل، **وبيتعمله commit جنب
كودك** — مش بيتظبّط من الواجهة. وده بيخلي البايبلاين **متراجَعة ومتوثّقة
وبترجع للخلف** زي أي كود.
:::

## Why it still exists

It is old, its UI shows it, and it is still everywhere. The honest reasons:

| Reason | What it means in practice |
|:---|:---|
| **It runs anywhere** | Your own hardware, air-gapped networks, regulated environments |
| **~1,800 plugins** | There is an integration for essentially anything |
| **No per-minute billing** | At high build volume, self-hosted is dramatically cheaper |
| **It predates the alternatives** | Fifteen years of accumulated pipelines nobody will rewrite |

And the honest costs:

| Cost | Why |
|:---|:---|
| You operate it | Upgrades, disk, backups, plugin CVEs — it is a service you own |
| Plugins are the attack surface | Most Jenkins CVEs are plugin CVEs |
| Groovy is a real language | Shared libraries become software that itself needs tests |
| Config drifts from code | Unless you enforce Configuration as Code |

:::key When Jenkins is the right answer, and when it is not
**Choose Jenkins when** you must self-host — regulatory, air-gapped, or on
hardware you already own — or when build volume makes hosted CI expensive, or
when you need an integration only a plugin provides.

**Choose hosted CI** (GitHub Actions, GitLab CI) for a new project on a public
forge. You are not going to out-operate a managed service, and "we run our own
CI" is infrastructure work that produces no product.
:::

:::ar ليه لسه موجود؟
هو قديم، والواجهة بتاعته بتقول كده، **ولسه موجود في كل حتة**. والأسباب الأمينة:

| السبب | معناه عملياً |
|:---|:---|
| **بيشتغل في أي مكان** | هاردوير بتاعك، شبكات مقفولة، بيئات فيها رقابة |
| **حوالي ١٨٠٠ plugin** | فيه تكامل مع أي حاجة تقريباً |
| **مفيش فاتورة بالدقيقة** | مع بناء كتير، الاستضافة الذاتية **أرخص بكتير** |
| **أقدم من البدائل** | ١٥ سنة من البايبلاينز محدش هيعيد كتابتها |

**والتكلفة الأمينة:**

| التكلفة | ليه |
|:---|:---|
| **إنت بتشغّله** | تحديثات، ديسك، باك أب، ثغرات plugins |
| **الـ plugins هي سطح الهجوم** | أغلب ثغرات Jenkins **ثغرات plugins** |
| **Groovy لغة حقيقية** | المكتبات المشتركة بتبقى **برنامج محتاج تستات** |
| **الإعدادات بتنحرف عن الكود** | إلا لو فرضت Configuration as Code |

:::key امتى يبقى Jenkins هو الصح؟
**اختاره لما:** تكون **مضطر** تستضيف بنفسك (رقابة، شبكة مقفولة، هاردوير
عندك)، أو حجم البناء يخلي الاستضافة المدارة غالية، أو محتاج تكامل مفيش
غير plugin بيعمله.

**واختار CI مُدارة** (GitHub Actions، GitLab CI) لأي مشروع جديد على منصة
عامة.

**إنت مش هتشغّل CI أحسن من شركة شغلتها كده**، و«إحنا بنشغّل الـ CI
بتاعتنا» شغل بنية تحتية **مش بيطلّع منتج**.
:::
:::

## What it is made of

| Piece | What it is |
|:---|:---|
| **Controller** | Schedules, stores config in `$JENKINS_HOME`, serves the UI |
| **Agent / node** | Where builds actually run |
| **Executor** | One concurrent build slot on an agent |
| **Job** | A thing that can run. Usually a Pipeline |
| **Jenkinsfile** | The pipeline, as code, in your repo |
| **Stage** | A named phase, shown as a column in the UI |
| **Shared library** | Groovy code reused across pipelines |
| **Credentials** | Secrets, injected into builds and masked in logs |

## How to use it

### A declarative pipeline

```groovy title="Jenkinsfile — declarative, which is what you want"
pipeline {
  // Run each stage in a fresh container. Nothing persists between builds,
  // which is the whole point — no "works on agent-3" mysteries.
  agent {
    kubernetes {
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          containers:
            - name: node
              image: node:22-alpine
              command: ['cat']
              tty: true
      '''
    }
  }

  options {
    timeout(time: 30, unit: 'MINUTES')     // never let a job hang forever
    disableConcurrentBuilds()              // one build per branch at a time
    buildDiscarder(logRotator(numToKeepStr: '30'))   // or the disk fills
  }

  environment {
    IMAGE = "registry.example.com/web"
    // Never interpolate a credential with ${} — see the warning below
    REGISTRY = credentials('registry-creds')
  }

  stages {
    stage('Test') {
      steps {
        container('node') {
          sh 'npm ci'
          sh 'npm test -- --ci --reporters=jest-junit'
        }
      }
      post {
        always { junit 'junit.xml' }       // publish results even on failure
      }
    }

    stage('Build and push') {
      when { branch 'main' }               // PRs are tested, never published
      steps {
        container('node') {
          // Tag with the commit SHA: immutable and traceable
          sh 'docker build -t $IMAGE:$GIT_COMMIT .'
          sh 'docker push $IMAGE:$GIT_COMMIT'
        }
      }
    }

    stage('Deploy') {
      when { branch 'main' }
      steps {
        // Wait for the rollout, and FAIL if it does not succeed
        sh 'kubectl set image deploy/web web=$IMAGE:$GIT_COMMIT'
        sh 'kubectl rollout status deploy/web --timeout=5m'
      }
    }
  }

  post {
    failure { slackSend(channel: '#alerts', message: "Build ${env.BUILD_URL} failed") }
    always  { cleanWs() }
  }
}
```

:::key Declarative, not scripted
Two syntaxes exist. **Declarative** (`pipeline { }`) is validated before the
build starts, renders properly in the UI, and constrains what you can do —
which is a feature.

**Scripted** (`node { }`) is raw Groovy. It is more powerful and becomes
unmaintainable, because every pipeline grows into a bespoke program only its
author understands.

Use declarative. Drop into `script { }` for the rare block that genuinely needs
logic.
:::

:::ar الـ pipeline بالشكل الوصفي
فيه صيغتين، **واختار الوصفية (declarative)**:

| | Declarative — `pipeline { }` | Scripted — `node { }` |
|:---|:---|:---|
| بيتفحص قبل ما يشتغل | **أيوه** | لأ |
| بيظهر صح في الواجهة | **أيوه** | مش دايماً |
| بيحد قدراتك | **أيوه — وده ميزة** | لأ |
| النتيجة على المدى الطويل | بايبلاين مقروءة | **برنامج Groovy محدش فاهمه غير كاتبه** |

**والحاجات اللي لازم تكون في كل Jenkinsfile:**

| الإعداد | ليه **ضروري** |
|:---|:---|
| `timeout(...)` | من غيره الـ job بيقعد **معلّق للأبد** وماسك executor |
| `buildDiscarder(...)` | من غيره **الديسك بيمتلي** والـ controller بيقع |
| `when { branch 'main' }` | عشان الـ PRs تتفحص **ومتتنشرش** |
| `post { always { junit ... } }` | عشان نتايج التستات تتنشر **حتى لو فشل** |
| `rollout status` | **عشان البايبلاين متكدبش** وتقول نجح والديبلوي باظ |

**والسطر الأخير ده أهمهم**، وهو نفس الدرس اللي في صفحة الـ CI/CD:
`kubectl set image` **بيرجع فوراً**، فمن غير `rollout status` البايبلاين
بتبقى خضرا والبرودكشن واقع.
:::

### Credentials

```groovy
withCredentials([usernamePassword(
    credentialsId: 'registry-creds',
    usernameVariable: 'USER',
    passwordVariable: 'PASS')]) {
  // Single quotes: the shell expands $PASS, Groovy never sees the value
  sh 'echo "$PASS" | docker login -u "$USER" --password-stdin registry.example.com'
}
```

:::danger Double quotes leak credentials into the build log
This is the most common Jenkins security mistake, and it is subtle:

```groovy
sh "docker login -p ${PASS}"   // ✘ Groovy interpolates BEFORE the shell runs
sh 'docker login -p $PASS'     // ✔ the shell expands it; Groovy never sees it
```

With double quotes, Groovy substitutes the secret into the command string. That
string is what Jenkins echoes into the console log — so the password appears in
plaintext, and Jenkins' masking cannot help because by then it is just part of
the command.

The rule: **single quotes for any `sh` step that touches a credential.** Jenkins
will warn you about this in the log, and the warning is worth acting on.
:::

### Multibranch and webhooks

A **Multibranch Pipeline** scans a repository and creates a job per branch and
per pull request automatically, each running that branch's own `Jenkinsfile`.

```diagram
   repo
    ├── main         → job, runs Jenkinsfile from main
    ├── feature/x    → job, created automatically on push
    └── PR #42       → job, runs the PR's Jenkinsfile
                       (from a fork? see the security warning)
```

Trigger it with a webhook rather than polling — polling every minute across 200
repos is wasted load and slow feedback.

:::warn A `Jenkinsfile` from a fork is untrusted code
A pull request from a fork can modify the `Jenkinsfile` itself. If your build
has credentials and runs that file, an attacker can exfiltrate them with a one
line change — exactly the risk described in [CI/CD](ci-cd.md).

Defences: build fork PRs **without** credentials, require approval before
building external contributions, and keep the deploy job separate from the
test job so only `main` ever touches production secrets.
:::

:::ar الصلاحيات والأسرار — وأشهر غلطة أمنية
:::danger الـ double quotes بتسرّب الأسرار في اللوج
دي أشهر غلطة أمنية في Jenkins، **وهي خبيثة عشان الفرق حرف واحد**:

```groovy
sh "docker login -p ${PASS}"   // ✘ غلط
sh 'docker login -p $PASS'     // ✔ صح
```

**إيه الفرق؟**

مع **الـ double quotes**، **Groovy** بيحط قيمة السر جوه نص الأمر **قبل**
ما الأمر يتنفّذ. والنص ده هو اللي Jenkins **بيطبعه في اللوج**.

فالباسورد بيظهر **صريح**، و **حجب Jenkins مش قادر يساعد** — عشان في
اللحظة دي السر بقى **جزء من الأمر نفسه** مش متغير.

مع **الـ single quotes**، Groovy **مش بيشوف القيمة خالص**. بيعدّي النص
زي ما هو للشِل، **والشِل** هو اللي بيفك `$PASS` وقت التنفيذ.

**القاعدة: single quotes في أي `sh` بيلمس سر.** ومن غير استثناء.
:::

:::danger و `Jenkinsfile` جاي من fork **ده كود مش موثوق**
الـ PR الجاي من fork **يقدر يعدّل الـ `Jenkinsfile` نفسه**.

فلو الـ build معاه صلاحيات وبيشغّل الملف ده، اللي فاتح الـ PR يقدر
**يسحب أسرارك بسطر واحد**.

**الدفاعات:** ابني PRs الـ forks **من غير أي صلاحيات**، اطلب موافقة قبل
بناء المساهمات الخارجية، **وافصل job النشر عن job التست** عشان `main`
بس هي اللي تلمس أسرار البرودكشن.
:::
:::

## Configuration as Code

A Jenkins configured by clicking is unreproducible. **JCasC** puts it in YAML:

```yaml title="jenkins.yaml"
jenkins:
  systemMessage: "Managed by JCasC. Do not configure through the UI."
  numExecutors: 0            # the controller NEVER builds. See below.
  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: "admin"
            permissions: ["Overall/Administer"]
            assignments: ["platform-team"]
  clouds:
    - kubernetes:
        name: "k8s"
        namespace: "jenkins"
        jenkinsUrl: "http://jenkins.jenkins.svc:8080"

unclassified:
  location:
    url: "https://jenkins.example.com/"
```

:::danger `numExecutors: 0` on the controller is a security control
If the controller has executors, builds run on the machine that holds
`$JENKINS_HOME` — every credential, every job definition, the whole
configuration.

A build runs code from a repository. Running it on the controller means any
repository you build can read your entire Jenkins. Set executors to **0** and
run everything on agents. This is the first finding in any Jenkins audit.
:::

:::ar الإعدادات ككود
Jenkins اللي اتظبّط بالضغط على الواجهة **مستحيل تعيد إنتاجه**. لو الجهاز
ضاع، إنت ضيّعت شهور من الإعدادات محدش فاكرها.

**و JCasC** بيحط كل ده في ملف YAML يتعمله commit.

:::danger و `numExecutors: 0` على الـ controller **إجراء أمني** مش تحسين أداء
لو الـ controller عنده executors، البيلدات بتشتغل على الجهاز اللي فيه
`$JENKINS_HOME` — **كل الأسرار، وكل تعريفات الـ jobs، والإعدادات كلها**.

**والبيلد بيشغّل كود جاي من ريبو.**

يعني تشغيله على الـ controller معناه إن **أي ريبو بتبنيه يقدر يقرا
Jenkins بتاعك كله**.

**خلّيها صفر، وشغّل كل حاجة على agents.** ودي **أول ملاحظة** في أي
مراجعة أمنية لـ Jenkins.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| Disk full on the controller | Build history and artefacts accumulate | `buildDiscarder` in every job |
| Builds queue but never start | No agent matches the `agent` label | Check agent labels and connectivity |
| `java.lang.OutOfMemoryError` | Controller heap too small for the job count | Raise heap; move work to agents |
| Works on one agent, not another | Agents are not identical — the classic pet problem | Ephemeral containerised agents |
| Plugin upgrade breaks everything | Plugins depend on core and each other | Staging Jenkins; pin versions; back up `$JENKINS_HOME` first |
| Credential visible in the log | Double-quoted `sh` step | Single quotes; rotate the credential |
| Pipeline passes, deploy is broken | No `rollout status` | Wait for and verify the deploy |
| `Scripts not permitted to use method...` | Groovy sandbox blocked a call | Approve in *In-process Script Approval*, or avoid the call |

:::warn The neglected-Jenkins failure mode
Jenkins rarely fails loudly. It degrades: the disk fills, plugins go years
without updates and accumulate CVEs, one agent becomes subtly different, and
`$JENKINS_HOME` has never been restored from backup so nobody knows whether the
backup works.

Three habits prevent all of it — `buildDiscarder` everywhere, a **quarterly
plugin update on a staging instance**, and a restore test you have actually
performed.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| الديسك بيمتلي على الـ controller | تاريخ البيلدات بيتراكم | `buildDiscarder` **في كل job** |
| البيلدات بتقف في الطابور | مفيش agent بالـ label ده | شيك على الـ labels والاتصال |
| `OutOfMemoryError` | الذاكرة صغيرة على عدد الـ jobs | كبّرها، **ونقّل الشغل للـ agents** |
| شغّال على agent وفاشل على تاني | **الـ agents مش متطابقين** | agents كونتينرات مؤقتة |
| تحديث plugin بوّظ كل حاجة | الـ plugins بتعتمد على بعض | Jenkins تجريبي، وثبّت النسخ، **وخُد باك أب الأول** |
| سر ظهر في اللوج | `sh` بـ double quotes | single quotes، **وغيّر السر** |
| البايبلاين خضرا والديبلوي باظ | مفيش `rollout status` | استنى النتيجة واتأكد |

:::warn وأخطر حاجة: Jenkins المهمَل
**Jenkins نادراً بيقع بصوت عالي. هو بيتدهور في سكوت:**

- الديسك بيمتلي بالتدريج
- الـ plugins بتقعد سنين من غير تحديث **وبتتكوّم عليها ثغرات**
- agent بيبقى مختلف شوية عن التاني **من غير ما حد ياخد باله**
- و `$JENKINS_HOME` **عمره ما اترجّع من باك أب**، فمحدش عارف الباك أب
  شغّال أصلاً ولا لأ

**وتلات عادات بتمنع ده كله:**

1. **`buildDiscarder` في كل job**، من غير استثناء.
2. **تحديث plugins كل ٣ شهور على نسخة تجريبية** الأول.
3. **اختبار استرجاع فعلي** — إنك ترجّع `$JENKINS_HOME` من الباك أب
   **وتتأكد إنه اشتغل**. الباك أب اللي ما اتجربش **مش باك أب**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Why should the Jenkins controller have zero executors?
**Because a build runs code from a repository, and the controller holds every
secret you have.**

`$JENKINS_HOME` contains credentials, job definitions, plugin configuration and
the private key that identifies the instance. If builds execute there, any
repository Jenkins builds can read all of it — and pull requests from forks can
modify the `Jenkinsfile` that does the reading.

Setting `numExecutors: 0` and running all work on agents means a compromised
build gets an ephemeral container, not your CI system.

:::key The follow-up
"What else would you check in a Jenkins security review?" — agents running as
root, credentials scoped globally instead of per-folder, plugins years out of
date, anonymous read access enabled, and the controller exposed to the internet
without SSO. Naming two or three shows this is not a memorised fact.
:::

:::ar
**عشان البيلد بيشغّل كود جاي من ريبو، والـ controller شايل كل أسرارك.**

ملف `$JENKINS_HOME` جواه: الصلاحيات، وتعريفات الـ jobs، وإعدادات الـ
plugins، والمفتاح الخاص بالنسخة نفسها.

فلو البيلدات بتشتغل هناك، **أي ريبو Jenkins بيبنيه يقدر يقرا ده كله** —
**و PRs الـ forks تقدر تعدّل الـ `Jenkinsfile`** اللي بيقرا.

ولما تخليها صفر وتشغّل كل حاجة على agents، البيلد المخترق بياخد
**كونتينر مؤقت**، مش **نظام الـ CI بتاعك**.

**والسؤال اللي بيجي بعده:** «وإيه كمان هتشيك عليه في مراجعة أمنية؟» —
agents شغالة كـ root، وصلاحيات معرّفة globally بدل ما تكون لكل folder،
و plugins قديمة بسنين، وقراءة مسموحة للمجهولين، والـ controller مكشوف
على الإنترنت من غير SSO.
:::
:::

:::q Declarative or scripted pipelines, and why?
**Declarative**, and the reason is that its constraints are the feature.

| | Declarative | Scripted |
|:---|:---|:---|
| Validated before the build starts | Yes | No — fails mid-run |
| Renders correctly in the UI | Yes | Partially |
| Expressive power | Deliberately limited | Full Groovy |
| Long-term outcome | A readable pipeline | A bespoke program only its author understands |

Scripted pipelines let each team invent its own control flow, and over a few
years you get Groovy applications with no tests sitting in the deploy path for
production. Declarative keeps pipelines comparable across repositories, which
is what lets a platform team support them at all.

For the genuinely dynamic case, declarative allows a `script { }` block — so
you keep the structure and escape only where you must.

:::ar
**الوصفية (declarative)**، **والسبب إن القيود بتاعتها هي الميزة**.

| | Declarative | Scripted |
|:---|:---|:---|
| بيتفحص قبل البدء | **أيوه** | لأ — بيفشل في النص |
| بيظهر صح في الواجهة | **أيوه** | جزئياً |
| القدرة التعبيرية | **محدودة بقصد** | Groovy كامل |
| النتيجة بعد سنين | بايبلاين مقروءة | **برنامج محدش فاهمه غير كاتبه** |

الـ scripted بتخلي كل فريق يخترع منطقه الخاص، وبعد كام سنة بتلاقي
**تطبيقات Groovy من غير أي تستات** قاعدة في **طريق النشر للبرودكشن**.

والوصفية بتخلي البايبلاينز **قابلة للمقارنة** بين الريبوهات — **وده
اللي بيخلي فريق منصة يقدر يدعمها أصلاً**.

**وللحالات اللي محتاجة منطق فعلاً**، الوصفية بتسمح بـ `script { }` —
فبتحافظ على الهيكل **وتهرب في الحتة اللي مضطر فيها بس**.
:::
:::

:::q Jenkins versus GitHub Actions versus GitLab CI — how do you choose?
Ask what constraint you actually have, then pick:

| | Jenkins | GitHub Actions | GitLab CI |
|:---|:---|:---|:---|
| Who operates it | **You** | GitHub | GitLab (or you) |
| Runs air-gapped | **Yes** | Self-hosted runners only | Yes |
| Cost model | Your hardware | Per-minute | Per-minute or self-hosted |
| Config lives in | `Jenkinsfile` | `.github/workflows/` | `.gitlab-ci.yml` |
| Ecosystem | ~1,800 plugins | Marketplace actions | Built-in, fewer add-ons |
| Main risk | Plugin CVEs, neglect | Supply chain: third-party actions | Coupling to GitLab |

**Decision rules:**

- Must self-host for regulatory or network reasons → **Jenkins**.
- Already on GitHub, normal project → **Actions**. Do not run CI you could rent.
- Already on GitLab → **GitLab CI**; the integration is the point.
- Very high build volume where per-minute billing hurts → self-hosted runners
  for the hosted product, before rebuilding on Jenkins.

:::key
The trap is answering with a favourite. Every option here is a reasonable
choice under some constraint; naming the *constraint* first is the answer.
Adding "and I would not run my own CI without a reason" shows you weigh
operational cost.
:::

:::ar
**اسأل: إيه القيد اللي عندك فعلاً؟** وبعدين اختار.

| | Jenkins | GitHub Actions | GitLab CI |
|:---|:---|:---|:---|
| مين بيشغّله | **إنت** | GitHub | GitLab أو إنت |
| شبكة مقفولة | **أيوه** | runners بتاعتك بس | أيوه |
| التكلفة | **الهاردوير بتاعك** | بالدقيقة | بالدقيقة أو ذاتي |
| الخطر الأساسي | ثغرات plugins، والإهمال | **سلسلة التوريد**: actions الغير | ارتباط بـ GitLab |

**قواعد الاختيار:**

- **مضطر تستضيف بنفسك** (رقابة أو شبكة) ← **Jenkins**
- **على GitHub ومشروع عادي** ← **Actions**. متشغّلش CI تقدر تستأجرها.
- **على GitLab** ← **GitLab CI**، التكامل هو الفايدة.
- **حجم بناء ضخم والفاتورة بتوجع** ← **runners بتاعتك** على المنتج
  المُدار، **قبل** ما تعيد بناء كل حاجة على Jenkins.

**والفخ إنك تجاوب باللي إنت بتحبه.** كل الاختيارات دي **معقولة تحت قيد
معيّن**، **وإنك تسمّي القيد الأول هو الإجابة**.

وإضافة «وأنا مش هشغّل CI بنفسي من غير سبب» بتوري إنك **بتحسب التكلفة
التشغيلية**.
:::
:::

## Key takeaways

- **Controller schedules, agents build.** `numExecutors: 0` on the controller
  is a security control, not a tuning knob.
- **Declarative pipelines**, in a `Jenkinsfile` committed with the code.
- **Single quotes for any `sh` touching a credential** — double quotes let
  Groovy interpolate the secret into the log.
- **`buildDiscarder` and `timeout` in every job**, or the disk fills and jobs
  hang forever holding executors.
- **Wait for the deploy.** `rollout status`, or the pipeline lies.
- **Fork pull requests are untrusted code.** Never build them with credentials.
- **Configuration as Code**, or your Jenkins is unreproducible.
- **Plugins are the attack surface** — update quarterly on staging, and test
  your `$JENKINS_HOME` restore.

:::ar الخلاصة
1. **الـ controller بيجدول، والـ agents بيبنوا.** و `numExecutors: 0`
   **إجراء أمني** مش ضبط أداء.
2. **بايبلاينز وصفية**، في `Jenkinsfile` متعمله commit مع الكود.
3. **single quotes في أي `sh` بيلمس سر** — الـ double quotes بتخلي
   Groovy يحط السر في اللوج.
4. **`buildDiscarder` و `timeout` في كل job**، وإلا الديسك بيمتلي
   والـ jobs بتتعلّق ماسكة executors.
5. **استنى الديبلوي.** `rollout status`، **وإلا البايبلاين بتكدب**.
6. **PRs الـ forks كود مش موثوق.** **عمرك ما تبنيها بصلاحيات.**
7. **الإعدادات ككود**، وإلا Jenkins بتاعك **مستحيل تعيد إنتاجه**.
8. **الـ plugins هي سطح الهجوم** — حدّث كل ٣ شهور على نسخة تجريبية،
   **وجرّب استرجاع الباك أب فعلاً**.
:::
