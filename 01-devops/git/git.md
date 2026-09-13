---
title: Git
slug: git
type: guide
domain: 01-devops
tags: [git, version-control]
keywords: [commit, branch, merge, rebase, remote, staging, stash, reset, revert,
           pull request, reflog, cherry-pick, bisect, force-with-lease,
           جيت, برانش, كوميت, دمج, تراجع]
level: 1
status: stable
prerequisites: []
related: [ci-cd, linux-basics, devops-interview-questions]
updated: 2026-09-08
---

# Git

> Git tracks snapshots of your whole project, not changes to individual files — once that clicks, most of Git stops being confusing.

## What is it?

Git is a version control system. It records **snapshots** of your project over
time, so you can see what changed, go back, and work on several things at once
without them interfering.

Every developer has a **complete copy** of the history. You can commit, branch
and search history with no network at all.

## The one model you need

Git has four places a file can be, and nearly every confusing Git moment comes
from not knowing which one you are in.

```diagram
   WORKING DIR        STAGING AREA       LOCAL REPO        REMOTE
   (your files)       (next commit)      (history)        (GitHub)
        │                   │                 │               │
        │──  git add  ─────→│                 │               │
        │                   │── git commit ──→│               │
        │                   │                 │── git push ──→│
        │←───────────  git checkout  ──────────│               │
        │←──────────────  git pull / fetch  ──────────────────│
```

| Place | What it holds | Command that moves things in |
|:---|:---|:---|
| **Working directory** | Files as they are right now | (you edit them) |
| **Staging area** (index) | What will go into the next commit | `git add` |
| **Local repository** | Committed history, on your machine | `git commit` |
| **Remote** | Shared history on a server | `git push` |

:::key Why a staging area exists at all
It lets you commit **part** of your work. You fixed a bug and also renamed a
variable — stage and commit just the bug fix, keeping the rename for a separate
commit.

That is the whole purpose. Without it, every commit would have to include
everything you had touched.
:::

:::ar أربع أماكن، وكل لخبطة في جيت سببها إنك مش عارف إنت فين
دي أهم صورة في الصفحة. **لو حفظتها، جيت بيبطّل يكون مربك.**

```diagram
   الملفات          منطقة التجهيز      التاريخ المحلي      الريموت
   بتاعتك           (الكوميت الجاي)    (على جهازك)        (GitHub)
      │                   │                 │               │
      │──  git add  ─────→│                 │               │
      │                   │── git commit ──→│               │
      │                   │                 │── git push ──→│
      │←───────────  git checkout  ──────────│               │
      │←──────────────  git pull / fetch  ──────────────────│
```

| المكان | فيه إيه | اللي بينقل ليه |
|:---|:---|:---|
| **Working directory** | ملفاتك زي ما هي دلوقتي | (إنت بتعدّلها) |
| **Staging area** | اللي هيدخل الكوميت الجاي | `git add` |
| **Local repo** | التاريخ المحفوظ على جهازك | `git commit` |
| **Remote** | التاريخ المشترك على السيرفر | `git push` |

**وأهم أمر في جيت كله:**

```sh
git status
```

ده بيقولك **إنت فين** من الأربعة دول، وعادةً بيقترح عليك الأمر اللي
محتاجه بعد كده. **شغّله على طول** — مش عيب، ده أسرع طريقة تفهم الموقف.

:::key وليه فيه staging area من الأصل؟
سؤال منطقي: ليه `git add` وبعدها `git commit`؟ ليه مش أمر واحد؟

**عشان تقدر تعمل كوميت لـ *جزء* من شغلك.**

مثال: إنت صلّحت باج، **وكمان** غيّرت اسم متغير. دي حاجتين مالهمش علاقة
ببعض، والمفروض يبقوا كوميتين مختلفين.

بالـ staging area تقدر:
```sh
git add src/login.js         # الباج بس
git commit -m "Fix login redirect"
git add src/utils.js         # وبعدين التغيير التاني
git commit -m "Rename helper for clarity"
```

**ومن غيرها، كل كوميت كان لازم يشيل كل حاجة إنت لمستها** — والتاريخ
بتاعك كان بيبقى كوميتات كبيرة مخلبطة محدش يفهم منها حاجة.
:::
:::

## What it is made of

| Concept | What it is |
|:---|:---|
| **Commit** | A snapshot plus a message, author and parent. Identified by a hash |
| **Branch** | A movable pointer to a commit. Cheap — it is just a label |
| **HEAD** | Where you are right now, usually the tip of a branch |
| **Remote** | A named URL for another copy, usually `origin` |
| **Tag** | A fixed label on one commit, for releases (`v1.2.0`) |

Branches being **just pointers** is why creating one is instant and why having
twenty costs nothing.

## How to use it

### Starting out

```sh
git init                              # start tracking a project here
git clone https://github.com/u/r.git  # copy an existing one

# Set your identity once, globally — commits are stamped with it
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### The everyday loop

This is 90% of Git use:

```sh
git status              # WHAT STATE AM I IN? Run this constantly
git diff                # unstaged changes
git diff --staged       # what's staged, i.e. what will be committed

git add file.js         # stage one file
git add .               # stage everything changed here
git commit -m "Fix login redirect"

git pull                # get others' work
git push                # publish yours
```

`git status` is the most useful command in Git. It tells you which of the four
places your changes are in, and usually suggests the command you want next.

### Branching

```sh
git switch -c feature/login    # create a branch and move to it
git switch main                # move back
git branch                     # list local branches
git branch -d feature/login    # delete a merged branch
```

`git switch` is the modern command for changing branches. `git checkout` still
works but does several unrelated jobs, which is why it confused people for a
decade — `switch` (branches) and `restore` (files) split it up.

### Merging vs rebasing

Both bring another branch's work into yours. They produce different history.

```diagram
   MERGE — keeps what actually happened
   main     A───B───────────M      M is a merge commit with two parents
                 \         /
   feature        C───D───┘

   REBASE — replays your commits on top, as if written later
   main     A───B
                 \
   feature        C'──D'           C and D are NEW commits (different hashes)
```

| | Merge | Rebase |
|:---|:---|:---|
| History | Truthful, shows the branch | Linear, easier to read |
| Commit hashes | Unchanged | **Rewritten** |
| Safe on shared branches | Yes | **No** |

```sh
git switch main && git merge feature/login    # merge
git switch feature/login && git rebase main   # rebase onto latest main
```

:::danger Never rebase a branch someone else is using
Rebase **creates new commits** with new hashes and abandons the old ones. If a
colleague has the old commits, your histories have diverged and their next pull
produces conflicts or duplicated commits.

The rule: rebase your **own unpushed** work freely, to tidy it before sharing.
Once it is pushed and others may have pulled it, merge instead.
:::

:::ar merge ولا rebase؟
الاتنين بيجيبوا شغل برانش تانية لبرانشك. **والفرق في شكل التاريخ اللي
بيطلع.**

```diagram
   MERGE — بيحفظ اللي حصل فعلاً
   main     A───B───────────M      الـ M كوميت دمج، له أبوين
                 \         /
   feature        C───D───┘        و C و D زي ما هما بالظبط

   REBASE — بيعيد كتابة كوميتاتك كأنها اتعملت بعدين
   main     A───B
                 \
   feature        C'──D'           دول كوميتات **جديدة** بهاشات جديدة
                                   والقديمة C و D اتخلوا عنها
```

| | Merge | Rebase |
|:---|:---|:---|
| التاريخ | صادق، بيوري إن فيه برانش | خط واحد، أسهل في القراءة |
| هاشات الكوميت | **زي ما هي** | **بتتغير كلها** |
| آمن على برانش مشتركة | **أيوه** | **لأ خالص** |

:::danger عمرك ما تعمل rebase لبرانش حد تاني شغّال عليها
دي أهم قاعدة في القسم ده، وكسرها بيعمل مشاكل الفريق كله بيتعب فيها.

الـ rebase **بيعمل كوميتات جديدة بهاشات جديدة، وبيتخلّى عن القديمة**.

فلو زميلك عنده الكوميتات القديمة على جهازه:

```diagram
   إنت:  عملت rebase و force push  →  الريموت فيه C' D'
   زميلك: عنده C D على جهازه
            │
            ↓
   يعمل git pull
            │
            ↓
   جيت يشوف تاريخين مختلفين تماماً لنفس الشغل
            │
            ↓
   يا كونفليكتات في كل حاجة، يا كوميتات متكررة مرتين
```

**والقاعدة البسيطة:**

> **rebase** لشغلك **إنت** اللي **لسه ما عملتلوش push** — عشان تنضّفه
> قبل ما تشاركه. حلو ومفيد.
>
> **merge** لأي حاجة **اتعملها push** وممكن حد سحبها.

**ولو مضطر تعمل force push** (مثلاً على برانش بتاعتك في PR)، استخدم:

```sh
git push --force-with-lease
```

دي أأمن من `--force` بمراحل: هي بتفشل لو حد تاني عمل push بعدك، بدل
إنها تمسح شغله. **اعتبر `--force` العادية ممنوعة، واستخدم دي دايماً.**
:::
:::

### Undoing things — pick by what you want to undo

This table is worth memorising; the wrong choice here is how work gets lost.

| Goal | Command | Destroys work? |
|:---|:---|:---|
| Unstage a file, keep the edits | `git restore --staged file` | No |
| Throw away edits to a file | `git restore file` | **Yes** |
| Fix the last commit's message | `git commit --amend` | No |
| Undo last commit, keep changes staged | `git reset --soft HEAD~1` | No |
| Undo last commit, keep changes unstaged | `git reset HEAD~1` | No |
| Undo last commit and **delete** the changes | `git reset --hard HEAD~1` | **Yes** |
| Undo a commit that is already pushed | `git revert <hash>` | No |

:::warn `reset` versus `revert` — the pushed/not-pushed rule
**`git reset`** rewrites history by moving the branch pointer. Fine for local
commits nobody has seen.

**`git revert`** creates a *new* commit that undoes an old one. History is
preserved, so it is safe on shared branches.

If the commit is already pushed, use `revert`. Using `reset` then forcing a push
rewrites history under your colleagues' feet.
:::

:::ar التراجع — اختار على أساس إنت عايز ترجّع إيه
**الجدول ده أهم جدول في الصفحة**، عشان الاختيار الغلط هنا هو اللي الشغل
بيضيع بسببه.

| عايز إيه | الأمر | بيمسح شغل؟ |
|:---|:---|:---|
| تشيل ملف من الـ staging وتسيب التعديلات | `git restore --staged file` | لأ |
| ترمي تعديلاتك على ملف | `git restore file` | **أيوه** |
| تصلّح رسالة آخر كوميت | `git commit --amend` | لأ |
| تلغي آخر كوميت والتعديلات تفضل staged | `git reset --soft HEAD~1` | لأ |
| تلغي آخر كوميت والتعديلات تفضل موجودة | `git reset HEAD~1` | لأ |
| تلغي آخر كوميت **وتمسح** التعديلات | `git reset --hard HEAD~1` | **أيوه** |
| تلغي كوميت **اتعمله push خلاص** | `git revert <hash>` | لأ |

**والقاعدة الذهبية: `reset` للمحلي، و `revert` للمنشور.**

```diagram
   الكوميت لسه على جهازك بس؟          الكوميت اتعمله push؟
   ─────────────────────────           ─────────────────────
   git reset                            git revert
   بيحرّك مؤشر البرانش                 بيعمل كوميت **جديد** بيلغي القديم
   والتاريخ القديم بيختفي               والتاريخ كله بيفضل موجود
        │                                    │
        ↓                                    ↓
   محدش شاف حاجة، فمفيش مشكلة          الزمايل بيسحبوا كوميت جديد
                                        عادي، ومفيش أي كونفليكت
```

**ولو عملت `reset` على حاجة منشورة وبعدها force push؟** إنت أعدت كتابة
التاريخ **من تحت رجل زمايلك**، وده بيوجعهم كلهم.

:::tip وفي جيت، تقريباً **مفيش حاجة بتضيع فعلاً**
دي أهم حاجة تعرفها وإنت مرعوب إنك ضيّعت شغل.

فيه حاجة اسمها `reflog` بتسجّل **كل مكان** الـ `HEAD` قعد فيه، **وده
بيشمل الكوميتات اللي إنت "مسحتها"** بـ `reset --hard` غلط.

```sh
git reflog
# هتشوف حاجة زي:
# a1b2c3d HEAD@{0}: reset: moving to HEAD~1
# e4f5g6h HEAD@{1}: commit: الشغل اللي إنت فاكر إنه ضاع   ← ده هو!

git reset --hard e4f5g6h     # ورجعت
```

والـ reflog بيحتفظ بالسجلات **٩٠ يوم** افتراضياً.

**فقبل ما تفزع إنك ضيّعت كوميتات، بصّ هنا الأول.** الإجابة عادةً سطر واحد
فوق مكانك.
:::
:::

### Stashing

You are mid-change and need to switch branches urgently:

```sh
git stash               # put changes aside, clean the working directory
git stash list          # see what you stashed
git stash pop           # bring the most recent back and remove it from the stash
git stash apply         # bring it back but KEEP it in the stash
```

### Looking at history

```sh
git log --oneline --graph --decorate -20   # compact visual history
git log -p file.js                          # how one file changed over time
git log --author="Ahmed"
git blame file.js                           # who last changed each line, and when
git show <hash>                             # everything about one commit
```

## When things go wrong

### Merge conflicts

Git stops and marks the file when both sides changed the same lines:

```text
<<<<<<< HEAD
const timeout = 3000;        ← your version
=======
const timeout = 5000;        ← incoming version
>>>>>>> feature/login
```

Edit the file to what it should be, **delete all three marker lines**, then:

```sh
git add file.js       # marks the conflict resolved
git commit            # (during a merge) or: git rebase --continue
```

To back out entirely: `git merge --abort` or `git rebase --abort`.

:::tip Almost nothing in Git is truly lost
`git reflog` records every position `HEAD` has been in, including commits you
"deleted" with a bad `reset`:

```sh
git reflog                    # find the hash you were on before the mistake
git reset --hard <that-hash>  # go back to it
```

Reflog entries persist for ~90 days by default. Before panicking about lost
commits, look here first — the answer is usually one line up.
:::

### Other common situations

| Situation | Fix |
|:---|:---|
| `rejected — non-fast-forward` on push | Someone pushed first. `git pull --rebase`, then push |
| Committed a secret | Rotate the secret immediately, **then** clean history. It is in the remote already |
| Committed to the wrong branch | `git reset --soft HEAD~1`, switch branch, commit again |
| Accidentally committed a huge file | Remove and amend if unpushed; otherwise `git filter-repo` |
| Detached HEAD | You are on a commit, not a branch. `git switch -c fix` to keep the work |

## Two files that save you trouble

**`.gitignore`** — never commit generated files, dependencies or secrets:

```text title=".gitignore"
node_modules/
dist/
.env
*.log
.DS_Store
```

**`.gitattributes`** — normalise line endings across Windows/Linux teams:

```text title=".gitattributes"
* text=auto
*.sh text eol=lf
```

Without the second one, a shell script committed on Windows gets CRLF line
endings and fails on Linux with `\r: command not found` — an error that names
the wrong problem entirely.

:::ar
**ملفين صغيرين بيوفّروا وجع دماغ كبير:**

**`.gitignore`** — عمرك ما تعمل كوميت لملفات مولّدة أو مكتبات أو أسرار:

```text
node_modules/
dist/
.env
*.log
```

**`.gitattributes`** — بيوحّد نهايات السطور بين ويندوز ولينكس:

```text
* text=auto
*.sh text eol=lf
```

:::warn ودي مشكلة بتضيّع ساعات لو إنت على ويندوز
سكريبت `.sh` تعمله كوميت من ويندوز، بياخد نهايات سطور ويندوز (CRLF).
وبعدين يشتغل على لينكس، فيقولك:

```text
/bin/bash^M: bad interpreter: No such file or directory
```
أو
```text
$'\r': command not found
```

**والرسالة دي بتسمّي المشكلة الغلط تماماً.** إنت بتقعد تدوّر على
`bad interpreter` وتفتكر إن `bash` مش منصّب، والمشكلة **حرف مخفي في آخر
كل سطر**.

والسطر `*.sh text eol=lf` بيمنع المشكلة دي من الأساس. **حُطّه في أي ريبو
فيه سكريبتات وفيه حد شغّال على ويندوز.**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Explain the difference between `git reset`, `git revert`, and `git checkout`.
They operate on different things, which is the real answer:

| Command | Moves / changes | Rewrites history? | Use when |
|:---|:---|:---|:---|
| `git reset` | the **branch pointer** | Yes | The commits are local only |
| `git revert` | creates a **new commit** | No | The commits are already pushed |
| `git checkout` / `restore` | **files** in your working tree | No | You want to discard edits, or inspect an old version |

```diagram
   before:   A ─── B ─── C ← main, HEAD

   git reset --hard B      →  A ─── B ← main, HEAD
                              (C is orphaned — findable via reflog)

   git revert C            →  A ─── B ─── C ─── C' ← main
                              (C' undoes C; both remain in history)
```

:::key The decision rule to state out loud
"Has anyone else seen this commit? If yes, `revert`. If no, `reset` is
fine." That single question is the whole answer, and it shows you are
thinking about the team rather than the command.
:::

:::ar
التلاتة **بيشتغلوا على حاجات مختلفة**، وده هو جوهر الإجابة:

| الأمر | بيحرّك إيه | بيعيد كتابة التاريخ؟ | تستخدمه امتى |
|:---|:---|:---|:---|
| `git reset` | **مؤشر البرانش** | أيوه | الكوميتات محلية بس |
| `git revert` | بيعمل **كوميت جديد** | لأ | الكوميتات اتعمللها push |
| `git checkout`/`restore` | **الملفات** في مجلد شغلك | لأ | عايز ترمي تعديلات أو تبص على نسخة قديمة |

**والقاعدة اللي تقولها بصوت عالي:**

> **«فيه حد تاني شاف الكوميت ده؟ لو أيوه، `revert`. لو لأ، `reset` تمام.»**

السؤال الواحد ده **هو كل الإجابة**، وبيبيّن إنك بتفكّر في **الفريق** مش
في الأمر.
:::
:::

:::q A secret was committed and pushed two weeks ago. What do you do, in order?
**Rotate the secret first. Everything else is second.**

The order matters and getting it wrong is the failed answer:

1. **Revoke and reissue the credential.** It is in the remote, in every
   clone, in forks, in CI logs, and possibly in a mirror or backup. Assume
   it is compromised — because it is.
2. **Remove it from the code** so the new secret does not follow it in, and
   move it to a secret manager or an environment variable.
3. **Then**, optionally, purge history with `git filter-repo` (or BFG) and
   coordinate a force-push, because every collaborator must re-clone.
4. **Add a guardrail** so it cannot recur: a pre-commit hook or CI scanning
   step (`gitleaks`, `trufflehog`), plus branch protection.

:::danger Why "we rewrote history, we are fine" is wrong
Rewriting history does not un-distribute a secret. GitHub keeps unreachable
objects reachable via the API for some time, forks retain them, and any
colleague who pulled has it on disk. CI logs may have printed it.

A candidate who reaches for `filter-repo` first has solved the *cosmetic*
problem and left the credential valid. The credential is the incident.
:::

:::ar
**اعمل rotate للسيكرت الأول. وأي حاجة تانية بعده.**

**الترتيب هو المهم**، واللي بيعكسه بيرسب في السؤال:

**١. ابطّل المفتاح واعمل واحد جديد.** هو موجود في الريموت، وفي كل نسخة
حد سحبها، وفي الـ forks، وفي لوجز الـ CI، وممكن في mirror أو باك أب.
**اعتبره مكشوف — عشان هو فعلاً مكشوف.**

**٢. شيله من الكود** عشان السيكرت الجديد ما يمشيش وراه، وحُطّه في secret
manager أو متغير بيئة.

**٣. وبعد كده** (اختياري) نضّف التاريخ بـ `git filter-repo`، ونسّق مع
الفريق عشان **كل واحد لازم يعمل clone من الأول**.

**٤. حُط حاجز يمنع التكرار:** hook قبل الكوميت، أو خطوة فحص في الـ CI
زي `gitleaks` أو `trufflehog`.

:::danger وليه «إحنا نضّفنا التاريخ، خلاص تمام» إجابة غلط؟
عشان **تنضيف التاريخ مش بيسحب السيكرت من الناس اللي خدوه**.

- GitHub بيحتفظ بالأوبجكتس المهجورة ومتاحة من الـ API لفترة
- الـ forks شايلة نسخة
- أي زميل سحب الكود، عنده السيكرت على الديسك
- لوجز الـ CI ممكن تكون طبعته

**واللي بيمد إيده على `filter-repo` الأول، ده حل المشكلة الشكلية وسايب
المفتاح شغّال.**

**والمفتاح هو الحادثة.** التاريخ تفصيلة تجميلية.
:::
:::
:::

:::q How do you find which commit introduced a bug in a 2,000-commit history?
`git bisect` — a binary search over history. It finds the culprit in about
11 steps for 2,000 commits, instead of 2,000.

```sh
git bisect start
git bisect bad                  # the current commit is broken
git bisect good v1.4.0          # this tag was known good

# Git checks out the midpoint. Test it, then tell Git:
git bisect good     # or: git bisect bad
# repeat — Git halves the range each time

git bisect reset                # return to where you started
```

And if the test can be scripted, do not do it by hand at all:

```sh
# Any non-zero exit means "bad". Git runs it on each candidate.
git bisect start HEAD v1.4.0
git bisect run npm test
```

:::key The senior addition
Mention that `bisect run` turns debugging into an automated search, and that
this is a strong argument for **small, atomic commits**: bisect lands you on
one commit, and if that commit changed forty files across three concerns, you
have narrowed the search far less than the tool promised. Commit hygiene has
a concrete debugging payoff, and that connection is what the interviewer is
listening for.
:::

:::ar
`git bisect` — وده **بحث ثنائي** في التاريخ.

لـ ٢٠٠٠ كوميت، بيلاقيلك الكوميت المسبب في حوالي **١١ خطوة** بدل ٢٠٠٠.

```sh
git bisect start
git bisect bad              # الحالي باظ
git bisect good v1.4.0      # التاج ده كان سليم

# جيت بيوديك لنص المسافة. جرّب، وقوله:
git bisect good             # أو: git bisect bad
# وكرّر — وهو بينصّف المدى كل مرة

git bisect reset            # ترجع لمكانك
```

**ولو التست ينفع يتكتب سكريبت، متعملهاش بإيدك خالص:**

```sh
git bisect start HEAD v1.4.0
git bisect run npm test        # أي exit مش صفر معناه "باظ"
```

وسيبه يمشي لوحده، ويرجعلك بالكوميت المسبب بالاسم.

**والإضافة اللي بتبيّن السينيورتي:**

قول إن `bisect run` بيحوّل التشخيص لبحث آلي، **وإن ده حجة قوية للكوميتات
الصغيرة والمركّزة**.

ليه؟ عشان الـ bisect بيوصّلك لـ **كوميت واحد**. فلو الكوميت ده غيّر
٤٠ ملف في ٣ مواضيع مختلفة، إنت **ما ضيّقتش المشكلة** بالقدر اللي الأداة
وعدتك بيه — لسه قصادك ٤٠ ملف تدوّر فيهم.

**فنظافة الكوميتات ليها مكسب حقيقي وملموس في التشخيص** — والربط ده
بالظبط هو اللي المُحاور مستنيه.
:::
:::

## Key takeaways

- **Four places:** working dir → staging → local repo → remote. `git status`
  tells you which one you are in.
- **Branches are pointers.** Creating them is free.
- **Merge keeps history, rebase rewrites it.** Only rebase your own unpushed
  work.
- **`reset` for local commits, `revert` for pushed ones.**
- `--hard` and `git restore <file>` are the only two commands here that
  **delete** work. Everything else is recoverable.
- **`git reflog`** finds commits you thought you destroyed.
- **`git bisect run`** finds the commit that broke it, automatically.

:::ar الخلاصة
1. **أربع أماكن:** ملفاتك ← staging ← التاريخ المحلي ← الريموت.
   و **`git status`** بيقولك إنت فين. شغّله على طول.
2. **البرانشات مجرد مؤشرات.** عملها مجاني، فمتبخلش على نفسك.
3. **merge بيحفظ التاريخ، و rebase بيعيد كتابته.** اعمل rebase لشغلك
   **إنت** اللي **لسه ما اتعملوش push** وبس.
4. **`reset` للكوميتات المحلية، و `revert` للمنشورة.** والسؤال اللي
   يحسم: «فيه حد تاني شافها؟»
5. **`--hard` و `git restore <file>`** هما **الأمرين الوحيدين** هنا اللي
   **بيمسحوا** شغل. أي حاجة تانية بترجع.
6. **`git reflog`** بيلاقيلك الكوميتات اللي إنت فاكر إنك دمّرتها.
7. **`git push --force-with-lease`** بدل `--force` دايماً.
8. **`git bisect run`** بيلاقي الكوميت اللي بوّظ الدنيا لوحده.
9. **سيكرت اتعمله كوميت؟** **اعمله rotate الأول.** تنضيف التاريخ حاجة
   تجميلية بعد كده.
:::
