---
title: SSH
slug: ssh
type: guide
domain: 00-foundations
tags: [ssh, linux, security]
keywords: [ssh keys, public key, private key, authorized_keys, ssh config,
           tunnel, port forward, agent, scp, rsync, proxyjump, bastion,
           known_hosts, ed25519, اس اس اتش, مفتاح, سيرفر, نفق]
level: 1
status: stable
prerequisites: [networking-basics]
related: [linux-basics, git, devops-interview-questions]
updated: 2026-09-08
---

# SSH

> SSH is how you reach every server you will ever manage — and once `~/.ssh/config` is set up, it becomes one short word instead of a long command.

## What is it?

SSH (Secure Shell) gives you an encrypted terminal on a remote machine. It also
carries file transfers (`scp`, `rsync`), Git over SSH, and tunnels.

```sh
ssh ubuntu@203.0.113.10
```

## How authentication works

There are two ways in, and only one of them is acceptable on a server.

```diagram
   PASSWORD                      KEY PAIR  ← use this
   ────────                      ────────
   you type a secret             you hold a PRIVATE key (never leaves your machine)
   over the network              server holds your PUBLIC key
                                          │
   guessable, brute-forceable     server sends a challenge
   shared, reusable               you sign it with the private key
                                  server verifies with the public key
                                          │
                                  the private key is never transmitted
```

The private key never travels. That is the whole point — nothing worth stealing
crosses the network.

:::ar الـ key pair دي إزاي بتشتغل؟
فيه طريقتين تدخل بيهم سيرفر، وواحدة بس منهم مقبولة.

**الباسورد:** إنت بتكتب سر وبيمشي على الشبكة. ده ممكن يتخمّن، وممكن حد
يقعد يجرّب فيه، وبتشاركه مع ناس، وبتستخدمه في أكتر من مكان.

**المفتاحين (key pair):** وده الصح، والفكرة عبقرية وبسيطة.

عندك **مفتاحين**، بيتعملوا مع بعض ومربوطين رياضياً:

| المفتاح | فين | تعمل بيه إيه |
|:---|:---|:---|
| **الخاص** (private) | على **جهازك** بس | **عمرك ما تشاركه مع حد** |
| **العام** (public) | على **السيرفر** | ده مفيش مشكلة تنشره في الشارع |

**والحوار اللي بيحصل:**

```diagram
   إنت                                    السيرفر
    │                                        │
    │ ── "أنا عايز أدخل" ──────────────────→ │
    │                                        │
    │ ←── "طيب، امضي على الرسالة دي" ──────── │  (تحدّي عشوائي)
    │                                        │
    │  تمضيها بالمفتاح الخاص                  │
    │ ── الإمضاء ──────────────────────────→ │
    │                                        │  يتأكد من الإمضاء
    │                                        │  بالمفتاح العام
    │ ←── "اتفضل" ─────────────────────────── │
    │                                        │
    └── والمفتاح الخاص **عمره ما مشي على الشبكة** ────┘
```

**وهي دي كل الحكاية:** المفتاح الخاص **عمره ما بيسافر**. فلو حد قاعد
بيتنصّت على الشبكة كلها، **مش هياخد حاجة تنفعه**. هو شاف إمضاء على رسالة
عشوائية مش هتتكرر تاني.

بينما الباسورد **بيمشي**، فأي حد في النص يقدر ياخده ويستخدمه.

**فكّر فيها كده:** المفتاح العام زي **قفل** بتوزّعه على السيرفرات. والمفتاح
الخاص هو **المفتاح** اللي في جيبك. توزيع أقفال مش مشكلة. المفتاح اللي في
جيبك ده اللي متسيبهوش.
:::

## What it is made of

| Piece | Where | Purpose |
|:---|:---|:---|
| **Private key** | `~/.ssh/id_ed25519` on **your** machine | Proves who you are. Never share it |
| **Public key** | `~/.ssh/id_ed25519.pub` | Safe to share. Goes on servers |
| **`authorized_keys`** | `~/.ssh/authorized_keys` on the **server** | List of public keys allowed in |
| **`known_hosts`** | `~/.ssh/known_hosts` on your machine | Server fingerprints you have accepted |
| **`config`** | `~/.ssh/config` on your machine | Per-host settings. The quality-of-life file |
| **Agent** | Running in your session | Holds unlocked keys so you type the passphrase once |

## How to use it

### 1. Create a key

```sh title="Once per machine"
# ed25519 — modern, short, fast. Use this unless something demands RSA.
# -C is just a comment so you can identify the key later.
ssh-keygen -t ed25519 -C "you@laptop"

# Accept the default path. Set a PASSPHRASE — it encrypts the key on disk,
# so a stolen laptop does not hand over your servers.
```

You now have two files. `id_ed25519` is secret; `id_ed25519.pub` is not.

### 2. Put the public key on the server

```sh
# The easy way — appends it to authorized_keys with correct permissions
ssh-copy-id ubuntu@203.0.113.10

# Manually, if ssh-copy-id is unavailable
cat ~/.ssh/id_ed25519.pub | ssh ubuntu@203.0.113.10 \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 3. Set up `~/.ssh/config` — do this early

This is the difference between remembering long commands and typing one word.

```text title="~/.ssh/config"
Host prod
    HostName 203.0.113.10
    User ubuntu
    IdentityFile ~/.ssh/prod_key
    # Offer ONLY that key. Without this, ssh presents every key in ~/.ssh in
    # turn and the server can refuse for too many auth attempts before
    # reaching the right one.
    IdentitiesOnly yes
    # Keep the connection alive through NAT/firewall idle timeouts
    ServerAliveInterval 60

Host github.com
    User git
    IdentityFile ~/.ssh/github_key
    IdentitiesOnly yes

# Reach a private machine THROUGH a bastion, in one command
Host db-private
    HostName 10.0.1.50
    User ubuntu
    ProxyJump prod
```

Now `ssh prod` is the whole command. And `scp file prod:/tmp/` works too.

:::key `IdentitiesOnly yes` is the fix for "Permission denied (publickey)"
By default SSH offers every key it can find. Servers commonly allow six
authentication attempts, so if the right key is seventh you are refused — even
though the key is perfectly valid.

The error says "publickey" and looks like a wrong-key problem. It is an
ordering problem. `IdentitiesOnly yes` with an explicit `IdentityFile` sends
exactly one key and removes the whole class of failure.
:::

:::ar ملف `~/.ssh/config` — اعمله من أول يوم
ده الفرق بين إنك تحفظ أوامر طويلة، وإنك تكتب كلمة واحدة.

**من غيره:**
```sh
ssh -i ~/.ssh/prod_key ubuntu@203.0.113.10
```

**ومعاه:**
```sh
ssh prod
```

الملف بسيط، اعمله في `~/.ssh/config`:

```text
Host prod
    HostName 203.0.113.10
    User ubuntu
    IdentityFile ~/.ssh/prod_key
    IdentitiesOnly yes
    ServerAliveInterval 60
```

| السطر | بيعمل إيه |
|:---|:---|
| `Host prod` | الاسم المختصر اللي هتكتبه |
| `HostName` | العنوان الحقيقي |
| `User` | اسم اليوزر، عشان متكتبوش كل مرة |
| `IdentityFile` | أنهي مفتاح |
| `IdentitiesOnly yes` | **اقرأ التحذير تحت، ده مهم** |
| `ServerAliveInterval 60` | يمنع الاتصال إنه يقطع لو سكت شوية |

**وأحلى حاجة:** `scp file prod:/tmp/` بتشتغل كمان لوحدها.

:::danger `IdentitiesOnly yes` هو حل `Permission denied (publickey)`
دي مشكلة بتضيّع وقت رهيب، والسبب مش اللي إنت فاكره.

SSH افتراضياً **بيعرض كل مفتاح لاقيه في `~/.ssh`**، واحد ورا التاني.

والسيرفرات عادةً بتسمح بـ **٦ محاولات** بس. فلو المفتاح الصح رقم ٧ في
الترتيب، السيرفر **بيرفضك** — **رغم إن المفتاح صح ١٠٠٪ وموجود في
`authorized_keys`**.

```diagram
   عندك ٨ مفاتيح في ~/.ssh
        │
   SSH يعرض: مفتاح ١ ✘  ٢ ✘  ٣ ✘  ٤ ✘  ٥ ✘  ٦ ✘
        │
        ↓
   السيرفر: "خلصت المحاولات" → Permission denied (publickey)
        │
        └── والمفتاح الصح كان رقم ٧، وعمره ما اتعرض!
```

**والرسالة بتقول "publickey" فبتفتكر إن المفتاح غلط.** وهي مش مشكلة
مفتاح غلط — **دي مشكلة ترتيب**.

و `IdentitiesOnly yes` مع `IdentityFile` محدد بتخلي SSH يبعت **مفتاح
واحد بالظبط**، فالمشكلة دي بتختفي من جذورها.

**وعشان تتأكد بنفسك:** شغّل `ssh -v prod` وبصّ على سطور
`Offering public key:` — هتشوف بعينك المفاتيح اللي بيعرضها بالترتيب.
:::
:::

### 4. Permissions matter, and SSH enforces them

```sh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519      # private key: owner only
chmod 644 ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/authorized_keys # on the server
```

:::danger "Permissions 0644 are too open" — SSH refuses to use the key
If a private key is readable by anyone else, SSH ignores it entirely rather
than risk it. The message names the file; `chmod 600` fixes it.

Two related traps:
- **Never store a private key in a synced folder** (OneDrive, Dropbox, Google
  Drive). It is uploaded to someone else's servers, and file permissions are
  often not preserved. Keep keys in `~/.ssh`.
- On Windows/Git Bash `chmod` does not always translate to Windows ACLs. If SSH
  still complains, fix it through the file's Properties → Security, or use
  `icacls`.
:::

## The agent — type your passphrase once

```sh
eval "$(ssh-agent -s)"          # start it (most desktops do this already)
ssh-add ~/.ssh/id_ed25519       # unlock the key; enter the passphrase once
ssh-add -l                      # which keys are loaded

# Forward the agent so a remote machine can use YOUR keys (e.g. to git clone)
ssh -A prod
```

:::warn Agent forwarding lets the remote host use your keys
Anyone with root on that server can, while you are connected, use your agent to
authenticate **as you** to anything your keys open.

Use `ProxyJump` instead — it tunnels the connection rather than lending your
credentials:

```sh
ssh -J bastion final-host        # or ProxyJump in ~/.ssh/config
```
:::

:::ar الـ agent، و ليه `-A` خطر
**الـ agent** برنامج صغير شغّال في جلستك، بيمسك مفاتيحك **مفتوحة** عشان
متكتبش الـ passphrase كل مرة.

```sh
ssh-add ~/.ssh/id_ed25519    # افتح المفتاح، واكتب الـ passphrase مرة واحدة
ssh-add -l                   # وريني المفاتيح المفتوحة
```

:::danger و `ssh -A` (agent forwarding) بتسلّم مفاتيحك للسيرفر
الناس بتستخدم `-A` عشان تعمل `git clone` من على السيرفر بمفاتيحها. ومنطقي.
**بس خد بالك من التكلفة.**

لما تعمل `ssh -A prod`، إنت بتفتح قناة بين السيرفر وبين الـ agent بتاعك.

**ومعناها إن أي حد معاه root على السيرفر ده يقدر — وإنت متصل — يستخدم
الـ agent بتاعك ويثبت إنه إنت لأي حاجة مفاتيحك بتفتحها.**

هو مش هياخد المفتاح نفسه (المفتاح لسه على جهازك)، بس هو **مش محتاج ياخده**
— هو بيقدر يطلب منك تمضي أي حاجة هو عايزها، وإنت مش هتعرف.

```diagram
   إنت ── ssh -A ──→ prod (فيه حد root عليه)
    │                  │
    │                  └── يستخدم الـ agent بتاعك
    │                       │
    │                       ↓
    │                  يدخل على GitHub بتاعك
    │                  يدخل على سيرفرات تانية مفاتيحك بتفتحها
    │
    └── والـ agent بتاعك بيمضي كل حاجة، لأنه مش عارف يفرّق
```

**البديل الصح: `ProxyJump`.** دي **بتنقّل الاتصال** من خلال السيرفر بدل
إنها **تسلّفه** مفاتيحك:

```sh
ssh -J bastion final-host
```

أو في `~/.ssh/config`:
```text
Host db-private
    HostName 10.0.1.50
    ProxyJump prod
```

**الفرق:** مع `ProxyJump` الـ bastion بيبقى **ماسورة بس**، والتشفير
بينك وبين الهدف النهائي مباشرة. الـ bastion **مش شايف** أي حاجة ومش
ماسك أي حاجة.
:::
:::

## Copying files

```sh
scp file.txt prod:/tmp/                 # to the server
scp prod:/var/log/app.log ./            # from the server
scp -r ./dist prod:/var/www/            # a directory

# rsync is better for anything repeated: only transfers differences
rsync -avz ./dist/ prod:/var/www/
rsync -avz --delete ./dist/ prod:/var/www/   # mirror exactly (removes extras)
```

Note the trailing slash on `./dist/` — with it you copy the *contents*, without
it you copy the *directory itself* into the destination. This trips everyone up
at least once.

## Tunnels

Reach a service that is not exposed to the internet:

```sh
# LOCAL forward: my localhost:5432 → the DB, as seen from the server
# Use it to point a local GUI at a private database.
ssh -L 5432:10.0.1.50:5432 prod

# Now: psql -h localhost -p 5432

# DYNAMIC: a SOCKS proxy through the server, for browsing internal sites
ssh -D 1080 prod
```

```diagram
   your laptop                      server            private DB
   localhost:5432 ───ssh tunnel───→ prod ──────────→ 10.0.1.50:5432
        │
   psql -h localhost
```

This is the safe way to reach a private database: nothing new is exposed, and
the connection is encrypted and authenticated by SSH.

:::ar
الـ tunnel ده أنفع حاجة في SSH وأقل حاجة الناس بتستخدمها.

**السيناريو:** عندك داتابيز في شبكة خاصة، ومش مكشوفة على الإنترنت (وده
صح!). وإنت عايز توصلها بأداة على جهازك (DBeaver، pgAdmin، TablePlus).

**الحل:**

```sh
ssh -L 5432:10.0.1.50:5432 prod
```

اقرا الأمر ده كده: **«خُد بورت ٥٤٣٢ على جهازي، وودّيه على
`10.0.1.50:5432` من وجهة نظر السيرفر `prod`»**.

```diagram
   جهازك                          prod              الداتابيز الخاصة
   ─────                          ────              ────────────────
   localhost:5432 ══ نفق SSH ══→   │  ─────────────→ 10.0.1.50:5432
        │                          │
        │                     (بيشوف الشبكة
   pgAdmin بيتصل                    الخاصة)
   على localhost
```

وبعدها إنت بتوصل الأداة بتاعتك على `localhost:5432` عادي، وكأن الداتابيز
على جهازك.

**والترتيب في الأمر:** `-L <بورت عندك>:<العنوان من وجهة نظر السيرفر>:<بورته>`.

**وليه دي الطريقة الآمنة؟**

1. **مفيش أي حاجة جديدة اتكشفت** على الإنترنت. الداتابيز لسه مقفولة.
2. **الاتصال مشفّر** ومتحقّق منه بـ SSH.
3. **بيقفل لوحده** لما تقفل الـ SSH. مفيش حاجة بتفضل مفتوحة بالغلط.

وفيه نوع تاني مفيد: `ssh -D 1080 prod` بيعملك **SOCKS proxy**، فتقدر
تظبّط البراوزر عليه وتتصفّح المواقع الداخلية بتاعة الشركة كأنك جوه الشبكة.
:::

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| `Permission denied (publickey)` | Wrong key, or too many keys offered | `IdentitiesOnly yes` + explicit `IdentityFile`; check `authorized_keys` |
| `Permissions 0644 are too open` | Private key readable by others | `chmod 600` |
| `Connection refused` | sshd not running, or wrong port | Check the service; `-p 2222` if it is non-standard |
| **Connection times out** | Firewall — often the cloud one | Open port 22 in the cloud console *and* the host firewall |
| `Host key verification failed` | Server's key changed (rebuild, or an attack) | Verify it is expected, then `ssh-keygen -R <host>` |
| Connection drops when idle | NAT/firewall idle timeout | `ServerAliveInterval 60` |
| Slow to connect, then fine | Reverse-DNS lookup on the server | `UseDNS no` in `sshd_config` |

```sh
ssh -v prod       # verbose: shows which keys are offered and what is rejected
ssh -vvv prod     # very verbose, when -v is not enough
```

`ssh -v` is the diagnostic command. The line `Offering public key: ...` followed
by rejection tells you the server does not have that key.

## Hardening a server

```text title="/etc/ssh/sshd_config"
PasswordAuthentication no      # keys only. The single biggest win
PermitRootLogin no             # log in as a user, then sudo
```

```sh
sudo sshd -t                      # TEST the config before applying
sudo systemctl reload sshd
```

:::warn Test the config and keep your session open
A mistake in `sshd_config` can lock you out of the machine permanently if it is
your only access.

Always: `sshd -t` first, then reload, then **open a second session to verify**
while the first one is still connected. If the new session fails, you still have
the old one to fix it with.
:::

:::ar
**أهم سطرين تحطهم في `/etc/ssh/sshd_config`:**

```text
PasswordAuthentication no      # مفاتيح بس. ده أكبر مكسب أمني بسطر واحد
PermitRootLogin no             # ادخل كيوزر عادي، وبعدين sudo
```

السطر الأول لوحده **بيلغي كل هجمات تخمين الباسوردات**. ولو فتحت لوجز أي
سيرفر على الإنترنت، هتلاقي آلاف محاولات دخول بباسوردات كل يوم. السطر ده
بيخليهم كلهم بلا فايدة.

:::danger اختبر الإعدادات، **وسيب جلستك مفتوحة**
دي نصيحة ممكن تنقذك من سفرية للداتا سنتر.

**غلطة واحدة في `sshd_config` تقدر تقفل عليك السيرفر للأبد** لو ده كان
طريقك الوحيد ليه. وأنا بقصد للأبد فعلاً — مش هتقدر تدخل تصلّحها.

**فالترتيب المقدّس:**

```sh
# ١. اختبر الإعدادات **قبل** ما تطبّقها
sudo sshd -t
#    لو فيها غلطة، هيقولك السطر بالظبط. صلّحها ومتكملش.

# ٢. طبّق
sudo systemctl reload sshd

# ٣. **ومن تيرمينال تاني خالص**، جرّب تدخل
ssh prod
```

**والنقطة الحرجة:** **متقفلش الجلسة الأولى**. سيبها مفتوحة لحد ما تتأكد إن
الجلسة الجديدة شغالة.

لو الجديدة فشلت، إنت لسه معاك القديمة تصلّح بيها. لو كنت قفلتها، خلاص.

ودي بالمناسبة نفس المنطق في أي حاجة بتغيّر طريق وصولك: **افتح الباب
الجديد قبل ما تقفل القديم.**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q How does SSH key authentication work? Why is it better than a password?
The key point is that **the private key never crosses the network.**

The server holds your public key. On connection it sends a random challenge;
you sign it with the private key; the server verifies the signature with the
public key. An attacker watching the whole exchange sees a signature over a
nonce that will never be reused.

| | Password | Key pair |
|:---|:---|:---|
| Crosses the network | **Yes** (inside TLS, but it arrives) | **No** |
| Brute-forceable | Yes | Not realistically |
| Reused across systems | Usually | Each server holds only a public key |
| Revoking one user | Change the shared secret | Delete one line from `authorized_keys` |

:::key The follow-up worth pre-empting
"Then why bother with a passphrase on the key?" Because the private key is a
**file**. A passphrase encrypts it at rest, so a stolen laptop does not hand
over every server. The `ssh-agent` then holds it unlocked so you type the
passphrase once per session — you get both security and convenience.
:::

:::ar
النقطة الجوهرية إن **المفتاح الخاص عمره ما بيمشي على الشبكة**.

السيرفر شايل مفتاحك العام. وقت الاتصال بيبعتلك **تحدّي عشوائي**، إنت
بتمضيه بالمفتاح الخاص، والسيرفر بيتحقق من الإمضاء بالمفتاح العام.

فأي حد بيتنصّت على التبادل كله، شايف **إمضاء على رسالة عشوائية مش
هتتكرر تاني** — ومفيش أي حاجة تنفعه.

| | الباسورد | المفتاحين |
|:---|:---|:---|
| بيمشي على الشبكة | **أيوه** (مشفّر، بس بيوصل) | **لأ** |
| ينفع يتخمّن | أيوه | مستحيل عملياً |
| متكرر بين الأنظمة | غالباً | كل سيرفر شايل مفتاح عام بس |
| تشيل يوزر واحد | تغيّر السر المشترك | تمسح سطر من `authorized_keys` |

**والسؤال اللي بيجي بعده — جاوبه من نفسك:**

«أمال ليه نحط passphrase على المفتاح؟»

عشان المفتاح الخاص **ملف**. والـ passphrase **بتشفّره على الديسك**، فلو
اللاب اتسرق، اللي خده مش هياخد معاه كل سيرفراتك.

والـ `ssh-agent` بعد كده بيمسك المفتاح **مفتوح** فإنت بتكتب الـ passphrase
**مرة واحدة في الجلسة** — فبتاخد الأمان والراحة مع بعض.
:::
:::

:::q `Permission denied (publickey)` — but the key is definitely in `authorized_keys`. What now?
Four causes, and they need different fixes. Start with `ssh -v`, which prints
exactly which keys were offered and what the server did with each.

| Cause | Tell | Fix |
|:---|:---|:---|
| **Too many keys offered** | `-v` shows 6 keys offered, then denial | `IdentitiesOnly yes` + explicit `IdentityFile` |
| Permissions on the **server** | `sshd` logs "bad ownership or modes" | `chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys` |
| Permissions on **your** key | `Permissions 0644 are too open` | `chmod 600` |
| Wrong **user** | You are trying `root@` on a host that forbids it | Use the right user; `PermitRootLogin no` is common |

```sh
ssh -v prod                          # which keys are offered, and rejected
sudo tail -50 /var/log/auth.log      # on the SERVER — the real reason
```

:::key The one most people miss
The server-side permission check. `sshd` **silently ignores**
`authorized_keys` if the file or the home directory is group- or
world-writable — it is protecting you from someone else having appended a key.
The client just sees "publickey" denied, with no hint. Only the server's
auth log says why, which is the real lesson: **when the client message is
uninformative, read the server log.**
:::

:::ar
أربع أسباب، وكل واحد له حل مختلف. ابدأ دايماً بـ `ssh -v` عشان هو بيوريك
المفاتيح اللي اتعرضت والسيرفر عمل إيه بكل واحد.

| السبب | تعرفه إزاي | الحل |
|:---|:---|:---|
| **مفاتيح كتير معروضة** | `-v` بيوري ٦ مفاتيح وبعدين رفض | `IdentitiesOnly yes` + `IdentityFile` |
| صلاحيات على **السيرفر** | لوج `sshd` بيقول "bad ownership or modes" | `chmod 700 ~/.ssh` و `chmod 600 authorized_keys` |
| صلاحيات **مفتاحك** | `Permissions 0644 are too open` | `chmod 600` |
| **يوزر غلط** | بتحاول `root@` وهو ممنوع | استخدم اليوزر الصح |

**والسبب اللي أغلب الناس بتفوّته: صلاحيات جهة السيرفر.**

الـ `sshd` **بيتجاهل ملف `authorized_keys` في سكوت تام** لو الملف أو
الـ home directory قابلين للكتابة من الجروب أو من أي حد.

وهو بيعمل كده **عشان يحميك** — لأن لو حد تاني يقدر يكتب في الملف ده،
يبقى يقدر يضيف مفتاحه هو ويدخل مكانك.

والعميل عندك بيشوف "publickey denied" وبس، **من غير أي تلميح**. والسبب
الحقيقي مكتوب في لوج السيرفر:

```sh
sudo tail -50 /var/log/auth.log
```

**والدرس الحقيقي من السؤال ده:** لما رسالة العميل تبقى فاضية من المعنى،
**اقرا لوج السيرفر**. وده مبدأ عام في التشخيص كله، مش في SSH بس.
:::
:::

:::q What is the security difference between `ssh -A` and `ssh -J`?
`-A` (agent forwarding) **lends your credentials**. `-J` (ProxyJump)
**tunnels the connection**. The difference is who can act as you.

```diagram
   ssh -A bastion              ssh -J bastion target
   ──────────────              ─────────────────────
   your agent is reachable     the bastion forwards
   FROM the bastion            encrypted bytes only
        │                            │
        ↓                            ↓
   root on the bastion can      the bastion cannot read
   sign challenges AS YOU,      the session or use your
   to anything your keys open   keys — end-to-end to target
```

With `-A`, anyone with root on the intermediate host can, while you are
connected, use your agent to authenticate as you to GitHub, to other
servers, to anything your keys open. They never obtain the key itself — they
do not need it.

With `-J`, the bastion is a pipe. The SSH session is negotiated end-to-end
with the final host, so the bastion sees only ciphertext.

**Use `ProxyJump`.** If you genuinely must forward an agent, scope it per
host in `~/.ssh/config` (`ForwardAgent yes` under one `Host` block only) —
never globally.

:::ar
الـ `-A` **بتسلّف صلاحياتك**. والـ `-J` **بتنقّل الاتصال**. والفرق هو:
**مين يقدر يتصرّف باسمك.**

مع `-A`، أي حد معاه root على السيرفر الوسيط يقدر — **وإنت متصل** —
يستخدم الـ agent بتاعك ويثبت إنه إنت لـ GitHub، ولسيرفرات تانية، ولأي
حاجة مفاتيحك بتفتحها.

وهو **عمره ما هياخد المفتاح نفسه** — بس هو **مش محتاجه**. هو محتاج بس
إنك تمضي، والـ agent بيمضي وهو مش عارف يفرّق.

مع `-J`، الـ bastion **ماسورة**. جلسة SSH بتتفاوض من الأول للآخر مع
الهدف النهائي، فالـ bastion **مش شايف غير كلام مشفّر**.

**فاستخدم `ProxyJump`.**

ولو مضطر فعلاً تعمل agent forwarding، **حدّده لسيرفر واحد بعينه** في
`~/.ssh/config`:

```text
Host that-one-server
    ForwardAgent yes      # لهنا بس، مش لكل حاجة
```

**وعمرك ما تحطها globally**، عشان كده معناها إنك بتسلّف مفاتيحك لكل
سيرفر تدخله في حياتك.
:::
:::

## Key takeaways

- **Keys, never passwords.** The private key never leaves your machine.
- **`~/.ssh/config`** turns long commands into `ssh prod`. Set it up early.
- **`IdentitiesOnly yes`** fixes most "Permission denied (publickey)" errors.
- **`chmod 600`** on private keys — SSH refuses looser permissions.
- **Never keep keys in a cloud-synced folder.**
- **`ProxyJump`, not agent forwarding**, to reach machines through a bastion.
- **`ssh -L`** to reach a private database safely.
- **`ssh -v`** when authentication fails; it shows exactly which key was
  refused.

:::ar الخلاصة
1. **مفاتيح، مش باسوردات.** المفتاح الخاص عمره ما بيسيب جهازك.
2. **`~/.ssh/config`** بيحوّل الأوامر الطويلة لـ `ssh prod`. **اعمله من
   أول يوم**، مش بعدين.
3. **`IdentitiesOnly yes`** بيحل أغلب أخطاء `Permission denied (publickey)`
   — عشان المشكلة **ترتيب** مش مفتاح غلط.
4. **`chmod 600`** على المفاتيح الخاصة. SSH بيرفض أي حاجة أوسع من كده.
5. **عمرك ما تحط مفتاح في فولدر متزامن** (OneDrive، Dropbox، درايف).
6. **`ProxyJump` مش agent forwarding** عشان توصل لسيرفر من خلال bastion.
7. **`ssh -L`** عشان توصل داتابيز خاصة بأمان، من غير ما تكشف حاجة.
8. **`ssh -v`** أول ما المصادقة تفشل — بيوريك المفتاح اللي اترفض بالظبط.
   ولو مش كفاية، **اقرا لوج السيرفر** `/var/log/auth.log`.
9. **بتغيّر `sshd_config`؟** `sshd -t` الأول، وسيب جلستك مفتوحة لحد ما
   تتأكد إن جلسة جديدة بتشتغل.
:::
