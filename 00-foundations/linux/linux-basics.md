---
title: Linux Basics
slug: linux-basics
type: guide
domain: 00-foundations
tags: [linux, filesystem, permissions, processes]
keywords: [bash, shell, chmod, systemd, package manager, apt, sudo, path]
level: 1
status: stable
prerequisites: []
related: [linux-commands, ssh, networking-basics]
updated: 2026-09-06
---

# Linux Basics

> Almost every server, container and cloud instance you will ever touch runs Linux — so this is the layer underneath everything else in these notes.

## What is it?

Linux is the operating system that runs the internet. When you deploy to AWS,
run a Docker container, or `kubectl exec` into a pod, you are working on Linux.

You interact with it through a **shell** — usually `bash` or `zsh` — by typing
commands. There is no GUI on a server.

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

## What it is made of

```diagram
   ┌──────────────────────────────────────────────┐
   │  your commands: bash, ls, curl, systemctl    │  ← userspace
   └──────────────────────┬───────────────────────┘
                          │ system calls
   ┌──────────────────────▼───────────────────────┐
   │              THE KERNEL                      │
   │  processes · memory · filesystems · network  │
   └──────────────────────┬───────────────────────┘
                          │ drivers
   ┌──────────────────────▼───────────────────────┐
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
that user access. `755` for directories and executables, `644` for regular
files, `600` for anything secret.
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
