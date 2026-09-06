---
title: Linux Command Cheat Sheet
slug: linux-commands
type: cheat-sheet
domain: 14-cheat-sheets
tags: [linux, cheatsheet, commands]
keywords: [bash, grep, awk, sed, find, ss, journalctl, systemctl, df, du, ps, top]
level: 1
status: stable
prerequisites: [linux-basics]
related: [kubectl-commands, networking-basics]
updated: 2026-09-06
---

# Linux Command Cheat Sheet

> Grouped by the question you are asking, because that is what you actually know when you need a command.

## The 60-second server triage

New server behaving badly? Run these in order. Each one accuses or clears a
resource.

| # | Command | What matters in the output |
|:--|:---|:---|
| 1 | `uptime` | Load average trend. On Linux this **includes disk-wait**, so high load with idle CPU means I/O |
| 2 | `dmesg -T \| tail -30` | Free, and often names the cause outright: OOM kills, disk errors |
| 3 | `df -h` | Any filesystem near 100% |
| 4 | `free -h` | Read **`available`**, not `free` |
| 5 | `top` (or `htop`) | Which process, and whether it is CPU or memory |
| 6 | `ss -lntp` | What is listening, and on which interface |
| 7 | `journalctl -p err -n 50` | Recent errors from every service |

## Files and directories

```sh
ls -lah                    # long, all, human sizes
cd -                       # jump back to where you were
find . -name "*.log"       # by name
find . -type f -size +100M # files over 100MB — finds the disk hog
find . -mtime -1           # changed in the last day
cp -r src/ dest/           # recursive copy
rsync -av --progress a/ b/ # better copy: resumable, shows progress
ln -s /real/path link      # symlink
stat file.txt              # size, permissions, all three timestamps
```

## Reading files and logs

```sh
less file.log              # page through. / to search, q to quit, G to end
tail -f app.log            # FOLLOW as it grows — the log-watching command
tail -f app.log | grep -i error   # follow, filtered
head -50 file.log
wc -l file.log             # count lines

grep -i "error" app.log            # case-insensitive
grep -rn "TODO" ./src              # recursive, with line numbers
grep -c "error" app.log            # just the count
grep -v "healthcheck" app.log      # INVERT — exclude noise
grep -A3 -B3 "exception" app.log   # 3 lines of context either side
zgrep "error" app.log.1.gz         # search compressed logs without unzipping
```

:::key `grep -v` is the one people forget
Filtering noise **out** is usually more useful than searching for something in.

```sh
tail -f access.log | grep -v -E "/healthz|/metrics|\" 200 \""
```
Now you only see what is actually interesting.
:::

## Text processing

```sh
# Column 1 of whitespace-separated text
awk '{print $1}' access.log

# Count occurrences and rank them — the classic log-analysis pipeline
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -20

# Substitute in place (make a .bak first)
sed -i.bak 's/old/new/g' config.txt

# CSV / colon-separated
cut -d: -f1 /etc/passwd

# Pretty-print and query JSON
cat data.json | jq '.items[].name'
kubectl get pods -o json | jq -r '.items[].metadata.name'
```

The `sort | uniq -c | sort -rn` pipeline answers "which value appears most?" —
top IPs, top error messages, top URLs. Worth memorising as one unit.

## Processes

```sh
ps aux                     # everything
ps aux | grep nginx
ps -ef --forest            # as a tree, showing parents
pgrep -a nginx             # PIDs matching a name
top                        # live. Press M to sort by memory, P by CPU
htop                       # nicer, if installed

kill <pid>                 # SIGTERM — asks nicely, allows cleanup
kill -9 <pid>              # SIGKILL — forces. No cleanup. Last resort
pkill -f "python app.py"   # by command line pattern

lsof -p <pid>              # what files/sockets it has open
lsof -i :8080              # WHAT IS USING PORT 8080 — very handy
```

## Disk

```sh
df -h                      # space per filesystem
df -i                      # INODES. "No space left" with space free = this
du -sh ./*                 # size of each item here
du -sh /var/log/* | sort -h    # find the big log directory
du -ah . | sort -rh | head -20 # 20 biggest files anywhere below here

# A deleted file still held open by a process keeps using space.
# This is why df and du disagree.
lsof +L1
```

:::danger `df` says full, `du` says empty
A file that was deleted while a process still had it open is gone from the
directory but its blocks are **not** freed until that process closes it. `du`
cannot see it; `df` still counts it.

Classic cause: someone `rm`'d a big log that the application still has open.
`lsof +L1` lists these. Restarting (or reloading) the process releases the space.
:::

## Memory

```sh
free -h                    # read the "available" column
vmstat 1 5                 # si/so non-zero = swapping = trouble
ps aux --sort=-%mem | head -10    # top memory consumers
dmesg -T | grep -i oom     # was something OOM-killed?
```

:::warn "Memory is 95% used" is usually fine
Linux fills spare RAM with page cache on purpose and reclaims it on demand. The
`available` column already accounts for that — it is the number to read.

Real pressure looks like `si`/`so` non-zero in `vmstat`, or OOM lines in
`dmesg`.
:::

## Network

```sh
ip addr                    # this machine's addresses
ip route                   # routing table. "default via ..." is the gateway
ss -lntp                   # LISTENING TCP ports + owning process
ss -tanp                   # all TCP connections
ss -tan state established | wc -l   # how many open connections

nc -zv host 5432           # is the port open? refused vs timeout matters
curl -v https://api.example.com/health
curl -o /dev/null -s -w "%{http_code} %{time_total}s\n" https://example.com
dig +short example.com
getent hosts example.com   # resolves the way your APPLICATION does
traceroute 8.8.8.8
mtr 8.8.8.8                # traceroute + live loss stats
tcpdump -i any -nn port 5432 -c 20   # capture 20 packets
```

## Services and logs (systemd)

```sh
systemctl status nginx           # running? plus recent log lines
systemctl restart nginx          # drops connections
systemctl reload nginx           # re-read config, keep serving — prefer this
systemctl enable nginx           # start on boot
systemctl list-units --failed    # WHAT IS BROKEN on this box

journalctl -u nginx -f           # follow one service
journalctl -u nginx -n 100
journalctl -u nginx --since "10 min ago"
journalctl -p err -b             # errors since this boot
journalctl --disk-usage          # journals can grow large
```

## Users and permissions

```sh
whoami; id                 # who am I, and which groups
chmod 644 file             # rw-r--r--  regular file
chmod 755 script.sh        # rwxr-xr-x  executable or directory
chmod 600 ~/.ssh/id_ed25519   # rw-------  secrets. SSH insists on this
chown user:group file
sudo -i                    # interactive root shell
sudo -u postgres psql      # run as another user
```

## Archives and transfers

```sh
tar -czf out.tar.gz dir/   # create gzipped
tar -xzf out.tar.gz        # extract
tar -tzf out.tar.gz        # LIST contents without extracting

scp file.txt user@host:/tmp/
scp -r dir/ user@host:/tmp/
rsync -avz --delete local/ user@host:/remote/   # mirror; --delete removes extras
```

## Shell survival

```sh
Ctrl+R      # search command history — the single best shortcut
Ctrl+C      # interrupt
Ctrl+Z      # suspend, then: bg, fg, jobs
Ctrl+A / E  # jump to start / end of line
!!          # repeat last command   →  sudo !!
!$          # last argument of the previous command

command > out.txt           # stdout to a file (overwrite)
command >> out.txt          # append
command 2> err.txt          # stderr only
command > all.txt 2>&1      # both
command | tee out.txt       # to screen AND file
nohup long-task &           # keep running after logout
```

`Ctrl+R` then a few characters of a command you ran last week will save you more
time than anything else on this page.

## The ten to memorise first

:::key
```sh
tail -f /var/log/app.log         # watch logs
grep -rn "error" .              # find things
ss -lntp                         # what is listening
df -h  &&  df -i                 # disk space, then inodes
free -h                          # memory (read "available")
ps aux --sort=-%mem | head       # what is eating RAM
systemctl status <svc>           # is it running
journalctl -u <svc> -n 100       # why is it not
lsof -i :8080                    # who has my port
Ctrl+R                           # find that command again
```
:::
