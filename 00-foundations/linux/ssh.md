---
title: SSH
slug: ssh
type: guide
domain: 00-foundations
tags: [ssh, linux, security]
keywords: [ssh keys, public key, private key, authorized_keys, ssh config, tunnel, port forward, agent, scp]
level: 1
status: stable
prerequisites: [networking-basics]
related: [linux-basics, git]
updated: 2026-09-06
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
