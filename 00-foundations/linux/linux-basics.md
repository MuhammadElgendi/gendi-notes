---
title: Linux Basics
slug: linux-basics
type: guide
domain: 00-foundations
tags: [linux, filesystem, permissions, processes]
keywords: [bash, shell, chmod, systemd, package manager, apt, sudo, path,
           inode, signal, sigterm, sigkill, journalctl, cgroup,
           لينكس, صلاحيات, بيرميشن, عمليات, سيرفر]
level: 1
status: stable
prerequisites: []
related: [linux-commands, ssh, networking-basics, devops-interview-questions]
updated: 2026-09-08
---

# Linux Basics

> Almost every server, container and cloud instance you will ever touch runs Linux — so this is the layer underneath everything else in these notes.

## What is it?

Linux is the operating system that runs the internet. When you deploy to AWS,
run a Docker container, or `kubectl exec` into a pod, you are working on Linux.

You interact with it through a **shell** — usually `bash` or `zsh` — by typing
commands. There is no GUI on a server.

:::ar
خلينا نتفق على حاجة من الأول: **لينكس هو النظام اللي شغّال الإنترنت.**

أي حاجة هتلمسها في الشغل ده بتقعد على لينكس. ترفع حاجة على AWS؟ لينكس.
تشغّل كونتينر دوكر؟ لينكس. تعمل `kubectl exec` وتدخل جوه بود؟ لينكس.

وإنت بتتكلم معاه بحاجة اسمها **shell** (غالباً `bash`) — بتكتب أوامر
وبيرد عليك. **ومفيش شاشة ولا فاره ولا أيقونات على السيرفر.** كل حاجة كتابة.

ولو الحكاية دي مخوّفة في الأول، الفكرة اللي تريّحك: إنت مش لازم تحفظ ٥٠٠
أمر. فيه حوالي **١٥ أمر** هتستخدمهم ٩٠٪ من وقتك، والباقي بتدوّر عليه لما
تحتاجه. والصفحة دي فيها الـ ١٥ دول.
:::

## Why it matters before anything else

Every layer above Linux is an abstraction over it. When those abstractions
leak — and they always do — you land back here:

| The abstraction | What you actually debug |
|:---|:---|
| "The container is out of memory" | A Linux cgroup limit and the OOM killer |
| "The pod can't reach the service" | Linux routing, DNS resolution, iptables |
| "The deploy hangs" | A Linux process ignoring a signal |
| "The disk is full" | Linux inodes, or a file nobody deleted properly |

Learning Kubernetes before Linux is possible, but you end up memorising
commands instead of understanding what they do.

:::ar ليه تبدأ من هنا بالتحديد
كل طبقة فوق لينكس هي مجرد **تغليف** ليه. والتغليف ده بيتشقّق، ودايماً
بيتشقّق. ولما يتشقّق، إنت بترجع تقف هنا.

بص على الجدول اللي فوق تاني، بس بالعربي:

| اللي بيقولوه | اللي إنت فعلاً بتظبّطه |
|:---|:---|
| «الكونتينر خلص رام» | حد cgroup في لينكس، والـ OOM killer |
| «البود مش بيوصل للسيرفيس» | راوتنج لينكس، وترجمة أسماء، و iptables |
| «الديبلوي معلّق» | عملية لينكس بتتجاهل إشارة |
| «الديسك فضي» | inodes، أو ملف حد مسحه غلط |

يعني إيه؟ يعني إنك تتعلّم كوبرنيتيس قبل لينكس **ممكن**، بس النتيجة إنك
هتحفظ أوامر من غير ما تفهم بتعمل إيه. وأول يوم حاجة تبوظ في البرودكشن،
هتلاقي نفسك بتقرأ رسالة إيرور بلغة إنت ما اتعلمتهاش.

**استثمر أسبوع هنا، توفّر شهور بعدين.** الكلام ده مش نصيحة معنوية، ده حساب.
:::

## What it is made of

```diagram
   ┌──────────────────────────────────────────────┐
   │  your commands: bash, ls, curl, systemctl    │  ← userspace
   └──────────────────────┬───────────────────────┘
                          │ system calls
   ┌──────────────────────↓───────────────────────┐
   │              THE KERNEL                      │
   │  processes · memory · filesystems · network  │
   └──────────────────────┬───────────────────────┘
                          │ drivers
   ┌──────────────────────↓───────────────────────┐
   │            hardware / hypervisor             │
   └──────────────────────────────────────────────┘
```

| Piece | What it does |
|:---|:---|
| **Kernel** | Manages processes, memory, devices and the network. You never call it directly |
| **Shell** | Reads your commands and runs them (`bash`, `zsh`) |
| **Filesystem** | One tree starting at `/`. Everything is a file, including devices |
| **Processes** | Every running program. Each has an ID (PID) and an owner |
| **Users & permissions** | Who may read, write or execute what |
| **systemd** | Starts and supervises long-running services |
| **Package manager** | Installs software (`apt`, `dnf`, `apk`) |

:::ar يعني إيه كل واحدة
الرسمة اللي فوق بتقول حاجة واحدة: **إنت مش بتكلّم الهاردوير، إنت بتكلّم
الكيرنل، والكيرنل هو اللي بيكلّم الهاردوير.**

وأي أمر بتكتبه، لما يحتاج حاجة حقيقية (يقرأ ملف، يبعت على الشبكة)، بينادي
على الكيرنل بحاجة اسمها **system call**. ودي الحدود بين عالمك وعالمه.

| الحاجة | بتعمل إيه | تخيلها زي |
|:---|:---|:---|
| **Kernel** | بيدير العمليات والرام والشبكة والأجهزة | مدير المبنى |
| **Shell** | بياخد أوامرك وينفّذها | الريسبشن اللي بتكلمه |
| **Filesystem** | شجرة واحدة بتبدأ من `/` | المبنى نفسه بأدواره |
| **Process** | أي برنامج شغّال، له رقم (PID) وصاحب | ساكن في المبنى |
| **Permissions** | مين من حقه يقرأ ويكتب ويشغّل إيه | مفاتيح الأبواب |
| **systemd** | بيشغّل ويراقب السيرفيسات الدايمة | الأمن اللي بيتأكد إن كله شغّال |
| **Package manager** | بينصّب البرامج | الاب ستور |

**وأغرب حاجة في لينكس لأي حد جاي من ويندوز:** مفيش `C:` ولا `D:`. فيه شجرة
واحدة بس بتبدأ من `/`، وكل حاجة معلّقة فيها — حتى الهاردات والأجهزة نفسها
بتبان كملفات جوه الشجرة دي.
:::

## How to use it

### The filesystem is one tree

There are no drive letters. Everything hangs off `/`:

| Path | Holds |
|:---|:---|
| `/etc` | Configuration files. Almost every "where do I change this?" ends here |
| `/var/log` | Logs |
| `/home/you` | Your files. Shortcut: `~` |
| `/usr/bin`, `/bin` | Installed programs |
| `/tmp` | Temporary files, usually wiped on reboot |
| `/proc`, `/sys` | Not real files — live kernel state exposed as files |
| `/opt` | Manually installed third-party software |

```sh title="Moving around"
pwd                 # where am I?
ls -lah             # list: long, all (incl. hidden), human-readable sizes
cd /var/log         # go somewhere
cd -                # jump back to the previous directory
find /etc -name "*.conf"   # find files by name
```

### Reading files without opening an editor

```sh
cat file.txt              # print the whole thing (small files only)
less file.txt             # page through it. q to quit, / to search
head -20 file.txt         # first 20 lines
tail -20 file.txt         # last 20 lines
tail -f /var/log/syslog   # FOLLOW a file as it grows — the log-watching command
grep -i "error" app.log   # find lines containing "error", case-insensitive
grep -rn "TODO" ./src     # recursive, with line numbers
```

`tail -f` and `grep` together will cover most of your log reading.

:::ar
لو حفظت أمرين بس من الصفحة دي كلها، خليهم دول:

**`tail -f /var/log/app.log`** — بيقعد يوريك الملف وهو بيكبر، سطر بسطر،
لايف. تشغّله في تيرمينال وتسيبه مفتوح، وتشوف التطبيق بيقول إيه لحظة بلحظة.

**`grep -i "error" app.log`** — بيطلّعلك السطور اللي فيها الكلمة دي بس.
الـ `-i` معناها متفرّقش بين الكبير والصغير.

وأحلى حاجة إنك تركّبهم على بعض:

```sh
tail -f app.log | grep -i error
```

يعني: «قعّدني على الملف، وورّيني السطور اللي فيها error بس». دي بتوفّر عليك
إنك تبص في شلال من السطور بتجري وإنت مش لاحق تقرأ.

**والفكرة الكبيرة اللي تفهمها من هنا:** العلامة `|` دي اسمها **pipe**،
ومعناها «الناتج بتاع الأمر اللي على الشمال، ادخّله للأمر اللي على اليمين».
وهي دي فلسفة لينكس كلها — أدوات صغيرة كل واحدة بتعمل حاجة واحدة صح،
وإنت بتوصّلهم على بعض زي المواسير.
:::

### Permissions

`ls -l` shows something like `-rw-r--r--`. Read it in four parts:

```diagram
   -    rw-      r--      r--
   │     │        │        │
  type  owner   group   everyone else
        (rw-)   (r--)     (r--)

   r = read (4)    w = write (2)    x = execute (1)
   rw- = 4+2 = 6       r-- = 4        rwx = 7
   so -rw-r--r-- is 644,  -rwxr-xr-x is 755
```

```sh
chmod 644 file.txt      # owner can edit, everyone can read
chmod +x script.sh      # make a script runnable — the common one
chown user:group file    # change owner (needs sudo)
```

:::warn `chmod 777` is not a fix
It means "anyone on this machine can read, change and run this". It is almost
never what you want, and on a private key some tools will refuse to use the
file at all.

If something cannot read a file, work out **which user** it runs as and grant
that user access. `755` for directories and executables, `600` for anything
secret.
:::

:::ar الأرقام دي جاية منين؟
`-rw-r--r--` دي مش طلاسم. اقراها على أربع حاجات:

```diagram
   -    rw-      r--      r--
   │     │        │        │
   │     │        │        └── أي حد تاني على السيرفر
   │     │        └─────────── الجروب
   │     └──────────────────── صاحب الملف
   └────────────────────────── نوعه (- ملف عادي، d فولدر، l اختصار)
```

وكل حرف له رقم، وإنت بتجمعهم:

| الحرف | معناه | رقمه |
|:---|:---|:---|
| `r` | read — يقرا | ٤ |
| `w` | write — يكتب ويعدّل | ٢ |
| `x` | execute — يشغّل | ١ |

فـ `rw-` = ٤+٢ = **٦**. و `r--` = **٤**. و `rwx` = ٤+٢+١ = **٧**.

يعني `-rw-r--r--` هي **٦٤٤**، و `-rwxr-xr-x` هي **٧٥٥**. خلاص، الحكاية دي
انتهت وعمرها ما هتلخبطك تاني.

**التلات أرقام اللي محتاجهم فعلاً:**

- **٦٤٤** لأي ملف عادي — صاحبه يعدّل، الباقي يقرا.
- **٧٥٥** للفولدرات والسكريبتات — لازم `x` عشان تشتغل.
- **٦٠٠** لأي حاجة سرية — صاحبها بس، ومحدش تاني خالص.

:::danger و `chmod 777` مش حل لأي مشكلة
٧٧٧ معناها حرفياً: **«أي حد على السيرفر ده يقرا ويعدّل ويشغّل الملف»**.

الناس بتعملها لما حاجة مش شغالة، وبتشتغل، وبيقولوا «تمام خلاص». وهي مش
تمام — إنت ما حليتش المشكلة، إنت شيلت القفل من على الباب.

والأسوأ: لو عملتها على مفتاح SSH، الـ `ssh` **هيرفض** يستخدم المفتاح
أصلاً ويقولك الملف مكشوف. فإنت كسّرت الحاجة اللي كنت بتحاول تصلّحها.

**الطريقة الصح:** اسأل نفسك «البرنامج ده شغّال بأنهي يوزر؟» — تعرفها من
`ps aux` أو `systemctl status` — وبعدها إدي **اليوزر ده بالتحديد** الصلاحية.
:::
:::

### Processes

```sh
ps aux                  # every process. Pipe into grep to find one
ps aux | grep nginx
top                     # live view, sorted by CPU. q to quit
htop                    # nicer top, if installed

kill <pid>              # ask politely (SIGTERM) — lets it clean up
kill -9 <pid>           # force (SIGKILL) — no cleanup. Last resort
```

:::key `kill` does not mean kill
Plain `kill` sends **SIGTERM**, a request to shut down that the program can
handle: finish the current request, flush data, exit cleanly.

`kill -9` sends **SIGKILL**, which cannot be caught. Nothing is flushed and no
cleanup runs — so a database killed this way may need recovery on restart.

Always try `kill` first. Reach for `-9` only when the process is genuinely
stuck.
:::

:::ar الفرق بين `kill` و `kill -9` مهم أكتر مما تتخيل
اسم الأمر مضلّل. `kill` **مش** معناها اقتل.

```diagram
   kill <pid>              kill -9 <pid>
   ─────────               ─────────────
   بيبعت SIGTERM           بيبعت SIGKILL
        │                        │
        ↓                        ↓
   البرنامج بيسمعها         البرنامج مش بيسمعها أصلاً
   ويقدر يقول "استنى":     الكيرنل بيشيله من الرام
   · يخلّص الريكوست          فوراً وخلاص
   · يكتب اللي في الرام
   · يقفل الكونيكشنز
   · وبعدين يموت           مفيش أي حاجة من دي بتحصل
```

**`kill` بيقول للبرنامج «لو سمحت اقفل»** — والبرنامج بيقدر يمسك الإشارة دي،
يخلّص اللي في إيده، يحفظ، ويقفل بالراحة. دي `SIGTERM`.

**`kill -9` بيقول للكيرنل «شيله»** — والبرنامج **مش بيعرف** حتى إنه بيموت.
مفيش حفظ، مفيش تنظيف، مفيش قفل كونيكشنز. دي `SIGKILL` ومحدش يقدر يتجاهلها.

**وعشان كده:** لو عملت `kill -9` لداتابيز، ممكن تلاقيها محتاجة recovery لما
تقوم تاني، وممكن تخسر آخر حاجات اتكتبت.

**القاعدة:** اطلب بالذوق الأول. `kill -9` آخر حاجة، ولما البرنامج يكون
معلّق فعلاً ومش بيرد.

:::note وده بالظبط نفس اللي بيحصل في دوكر وكوبرنيتيس
`docker stop` بيبعت `SIGTERM`، بيستنى ١٠ ثواني، وبعدين `SIGKILL`.
وكوبرنيتيس بيعمل نفس الحاجة بالظبط بس بـ ٣٠ ثانية (`terminationGracePeriodSeconds`).

يعني الحكاية اللي إنت بتتعلمها هنا في لينكس، هي **هي** اللي بتشتغل فوق في
كل الطبقات. عشان كده بنبدأ من هنا.
:::
:::

### Services with systemd

Anything that runs continuously — nginx, PostgreSQL, Docker — is a systemd
service.

```sh
sudo systemctl status nginx     # is it running? Shows recent log lines too
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx     # re-read config WITHOUT dropping connections
sudo systemctl enable nginx     # start automatically on boot
journalctl -u nginx -f          # follow this service's logs
journalctl -u nginx -n 100      # last 100 lines
```

`systemctl status` and `journalctl -u <service>` are the first two commands to
run when a service misbehaves. `status` says whether it is running; `journalctl`
says why it is not.

:::ar
أي حاجة شغالة على طول على السيرفر — nginx، بوستجرس، دوكر نفسه — دي بتبقى
**systemd service**.

ولما حاجة منهم تبوظ، فيه أمرين بس بتبدأ بيهم، بالترتيب ده:

```diagram
   1. systemctl status nginx      →  هو شغّال ولا لأ؟
                                      (وبيوريك آخر سطور لوج كمان)
              ↓
   2. journalctl -u nginx -n 100  →  ليه مش شغّال؟
                                      (السبب الحقيقي بيبان هنا)
```

يعني: **`status` بيقولك هو عايش ولا مات. و `journalctl` بيقولك مات ليه.**

وأهم فرق لازم تعرفه في الشغل:

| الأمر | بيعمل إيه | الكونيكشنز |
|:---|:---|:---|
| `restart` | بيقتل العملية ويشغّل واحدة جديدة | **بتقع كلها** |
| `reload` | بيقول للعملية «اقرا الإعدادات تاني» | **بتكمل عادي** |

فلو إنت على سيرفر ويب في البرودكشن وغيّرت إعداد، **`reload` الأول**. اللي
بيعمل `restart` على طول بيقطع على كل اللي بيستخدمو الموقع في اللحظة دي —
وده مش لازم، عشان nginx بيعرف يعيد قراءة إعداداته وهو شغّال.

بس خد بالك، مش كل سيرفيس بيدعم `reload`. لو مش مدعوم، `systemctl status`
هيقولك إن الطلب اتجاهل.
:::

:::tip `reload` versus `restart`
`restart` stops the process and starts a new one — connections drop.
`reload` tells the running process to re-read its configuration and keep
serving.

For a web server in production, always try `reload` first. Not every service
supports it; `systemctl status` will tell you if it was ignored.
:::

### Disk and packages

```sh
df -h                 # free space per filesystem
du -sh ./*            # size of each item here — finds the big directory
du -sh /var/log/*     # a very common culprit

sudo apt update              # refresh the package list (Debian/Ubuntu)
sudo apt install nginx       # install
sudo apt remove nginx        # uninstall
```

On RHEL, Rocky and Fedora the command is `dnf` instead of `apt`; on Alpine it
is `apk`.

## Two things that trip everyone up

:::danger "No space left on device" with free space showing
`df -h` shows 40% used, but writes still fail. The disk is not full — the
**inodes** are. Each file consumes one inode regardless of size, so millions of
tiny files exhaust the table while using little space.

```sh
df -i     # inode usage. IUse% at 100% is your answer
```

Usual cause: a directory full of session files, cache entries or unrotated
logs. Delete the files, then fix whatever created them.
:::

:::warn `sudo` changes the environment, not just the permissions
`sudo command` runs as root with a **different** `PATH` and environment. A
script that works for you can fail under `sudo` with "command not found", and
`sudo echo $HOME` prints *your* home because your shell expanded it before
`sudo` ran.

Use `sudo -i` for an interactive root shell, or give commands their full path.
:::

:::ar الحاجتين دول بيوقّعوا كل الناس
**١. «مفيش مساحة» والمساحة فاضية**

`df -h` بيقولك ٤٠٪ مستخدم، ومع ذلك مش قادر تكتب أي ملف. إيه الحكاية؟

**الديسك مش فضي — الـ inodes هي اللي فضيت.**

كل ملف بياخد **inode** واحدة، مهما كان حجمه. ملف فيه حرف واحد بياخد inode،
وملف ٢ جيجا بياخد inode. والجدول ده له عدد محدود.

فلو عندك مليون ملف صغير (session files، كاش، لوجز مش بتتلف)، الجدول خلص
وإنت لسه معندكش داتا تقريباً.

```sh
df -i      # بصّ على عمود IUse% — لو ١٠٠٪ يبقى دي هي
```

الحل: امسح الملفات، **وبعدين ظبّط الحاجة اللي بتعملهم** — عشان لو ما
ظبطتهاش هترجعلك تاني بعد أسبوع.

**٢. `sudo` مش بس بيغيّر الصلاحيات، بيغيّر البيئة كلها**

`sudo command` بيشتغل كـ root **وبـ `PATH` مختلف ومتغيرات مختلفة**.

فسكريبت شغّال معاك تمام، تحت `sudo` يقولك `command not found`. مش عشان
الصلاحيات — عشان الـ root معندهوش نفس الـ `PATH` بتاعك.

وفيه حاجة أظرف: `sudo echo $HOME` بتطبع **الـ home بتاعك إنت**، مش بتاع
الروت. ليه؟ عشان الشِل بتاعك فكّ `$HOME` **قبل** ما `sudo` يشتغل أصلاً.

الحل: `sudo -i` عشان تاخد شِل روت حقيقي، أو اكتب المسار الكامل للأمر.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is the difference between `SIGTERM` and `SIGKILL`, and why does it matter in production?
`SIGTERM` (signal 15, plain `kill`) is a **request**. The process receives it
and can run a handler: finish in-flight work, flush buffers, close
connections, deregister from a load balancer, then exit.

`SIGKILL` (signal 9) is not delivered to the process at all. The kernel
removes it. No handler runs, nothing is flushed.

Why it matters beyond Linux — the same two-phase shutdown is everywhere:

| Layer | Sends `SIGTERM`, waits, then `SIGKILL` |
|:---|:---|
| `docker stop` | 10 seconds by default (`--time`) |
| Kubernetes | 30 seconds (`terminationGracePeriodSeconds`) |
| systemd | 90 seconds (`TimeoutStopSec`) |

So an application that ignores `SIGTERM` does not shut down gracefully
*anywhere*, and every deploy silently drops in-flight requests.

:::ar
`SIGTERM` (رقم ١٥، وهو اللي `kill` بيبعته) هو **طلب**. البرنامج بيستلمه
ويقدر يعمل handler: يخلّص الشغل اللي في إيده، يكتب اللي في الرام على
الديسك، يقفل الكونيكشنز، يشيل نفسه من الـ load balancer، وبعدين يموت.

`SIGKILL` (رقم ٩) **مش بيوصل للبرنامج خالص**. الكيرنل بيشيله. مفيش handler
بيشتغل ومفيش أي حاجة بتتحفظ.

**وليه ده مهم أكتر من لينكس؟** عشان نفس الميكانيزم موجود في كل طبقة فوق:

| الطبقة | بتبعت SIGTERM، تستنى، وبعدين SIGKILL |
|:---|:---|
| `docker stop` | ١٠ ثواني |
| كوبرنيتيس | ٣٠ ثانية |
| systemd | ٩٠ ثانية |

يعني برنامج مش بيسمع `SIGTERM` **مش بيقفل بالراحة في أي مكان**، وكل ديبلوي
بيقطع على الريكوستات اللي كانت شغالة — من غير ما حد يلاحظ.
:::
:::

:::q `df` shows 90% used. You delete a 20 GB log file. `df` still shows 90%. Why?
Because a process still has the file open. `rm` removed the directory entry,
not the data.

The kernel frees an inode's blocks only when **both** the link count and the
open-descriptor count reach zero. `rm` dropped the link count to zero; the
descriptor is still held.

```sh
lsof +L1                   # files with link count 0 that are still open
lsof -nP | grep deleted

# Fix without a restart — truncate through the descriptor itself:
: > /proc/<pid>/fd/<fd>
```

:::key The design lesson worth adding
This is why log rotation configs use `copytruncate`, or send the service a
`SIGHUP` to reopen its files. A rotation script that just `rm`s the old log
leaks the space until the service happens to restart — which on a stable
service can be months.
:::

:::ar
عشان فيه عملية لسه ماسكة الملف مفتوح. `rm` شال **الاسم**، مشالش **الداتا**.

الكيرنل بيفك بلوكات الملف بس لما **الاتنين** يبقوا صفر: عدد الأسماء
اللي بتشاور عليه، وعدد العمليات اللي فاتحاه. `rm` صفّر الأول، والتاني
لسه واحد.

```sh
lsof +L1          # الملفات اللي اتمسحت ولسه مفتوحة
: > /proc/<pid>/fd/<fd>    # تفضّيه من غير ريستارت
```

**والدرس الهندسي:** عشان كده إعدادات لف اللوجز بتستخدم `copytruncate`، أو
بتبعت `SIGHUP` للسيرفيس عشان يفتح ملفاته من جديد.

سكريبت بيعمل `rm` للوج القديم وبس، بيسرّب المساحة لحد ما السيرفيس يحصله
ريستارت بالصدفة — وده على سيرفيس مستقر ممكن يبقى بعد شهور.
:::
:::

:::q A script works when you run it, and fails under `sudo` with "command not found". Why?
`sudo` does not just elevate privileges — it replaces the environment.
`secure_path` in `/etc/sudoers` overrides `PATH`, and most environment
variables are stripped unless explicitly preserved with `env_keep`.

So a binary in `/opt/tool/bin` that your shell finds via a `PATH` entry in
your `.bashrc` is simply not on root's `PATH`.

```sh
# Prove it — compare the two
echo "$PATH"
sudo sh -c 'echo "$PATH"'

# Fixes, best first
sudo /opt/tool/bin/mytool        # full path — explicit, no surprises
sudo -i                          # a real login shell for root
sudo -E command                   # preserve YOUR environment (use with care)
```

:::warn The related trap
`sudo echo $HOME` prints *your* home directory, and `sudo echo x > /root/f`
fails with permission denied. In both cases your shell expanded the variable
and opened the redirect **before** `sudo` ran — the elevation applies only to
`echo`. Use `sudo sh -c 'echo x > /root/f'`.
:::

:::ar
`sudo` مش بس بيرفع صلاحياتك — **بيستبدل البيئة كلها**.

فيه إعداد اسمه `secure_path` في `/etc/sudoers` بيلغي الـ `PATH` بتاعك،
وأغلب المتغيرات بتتشال إلا لو حد سمح بيها بالاسم.

فبرنامج موجود في `/opt/tool/bin` وإنت ضايفه في الـ `PATH` بتاعك من
`.bashrc`، ببساطة **مش موجود في `PATH` بتاع الروت**.

اتأكد بنفسك: `echo "$PATH"` وبعدها `sudo sh -c 'echo "$PATH"'` وقارن.

والحلول بالترتيب: اكتب المسار الكامل، أو `sudo -i` تاخد شِل روت حقيقي،
أو `sudo -E` تحافظ على بيئتك (بس خد بالك دي فيها مخاطر أمنية).

**والفخ اللي جنبه:** `sudo echo x > /root/f` بيفشل. ليه؟ عشان الشِل بتاعك
فتح الـ redirect **قبل** ما `sudo` يشتغل — فالصلاحية اتطبّقت على `echo`
بس. الصح: `sudo sh -c 'echo x > /root/f'`.
:::
:::

## Key takeaways

- **One tree from `/`.** Config in `/etc`, logs in `/var/log`, live kernel state
  in `/proc`.
- **`tail -f` and `grep`** will handle most log reading you ever do.
- **Permissions are three groups of `rwx`** — owner, group, everyone. `644` for
  files, `755` for executables, `600` for secrets. Never `777`.
- **`kill` asks, `kill -9` forces.** Always ask first.
- **`systemctl status` then `journalctl -u`** — the two commands for any broken
  service.
- **`df -h` for space, `df -i` for inodes.** "Full disk" with space free means
  inodes.

:::ar الخلاصة
1. **شجرة واحدة من `/`.** الإعدادات في `/etc`، اللوجز في `/var/log`، وحالة
   الكيرنل الحية في `/proc`.
2. **`tail -f` و `grep`** هيعملولك أغلب قراءة اللوجز اللي هتعملها في حياتك.
3. **الصلاحيات تلات مجموعات `rwx`** — الصاحب، الجروب، الباقي. ٦٤٤ للملفات،
   ٧٥٥ للسكريبتات، ٦٠٠ للسري. **ومتكتبش ٧٧٧ خالص.**
4. **`kill` بيطلب، و `kill -9` بيفرض.** اطلب الأول دايماً.
5. **`systemctl status` وبعدها `journalctl -u`** — الأمرين لأي سيرفيس باظ.
   الأول بيقولك عايش ولا مات، والتاني بيقولك مات ليه.
6. **`df -h` للمساحة، و `df -i` للـ inodes.** «ديسك فضي» والمساحة موجودة
   يعني الـ inodes خلصت.
7. **`reload` قبل `restart`** على أي حاجة في البرودكشن. الأول بيحافظ على
   الكونيكشنز، والتاني بيقطعها.
:::
