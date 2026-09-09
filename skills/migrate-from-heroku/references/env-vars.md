# Env var classification

Every key in `inventory.json`'s `config` object gets exactly one of four labels — **keep**,
**drop**, **re-point**, **re-signup**. Put the table in MIGRATION.md with **names and labels
only — never values**.

## drop — Heroku injects these; Hatchbox does not need them

- `PORT` — Hatchbox sets it per process via socket activation. Because the platform supplies it
  on **both** sides, a post-migration check that treats a still-present `PORT` as a leftover you
  wrongly recreated will report a false failure. Confirm against your own ledger instead: if you
  never created it, it is the platform's.
- `DYNO`, `DYNO_RAM` (`WEB_CONCURRENCY` is a judgment call — see below, do not blanket-drop it)
- `HEROKU_*` — all of them, including the dyno-metadata labs vars. **Grep the source before you
  drop them**, see below.
- Any add-on var whose add-on is bucketed **drop** in `references/addons.md`.

`DATABASE_URL` is **not** in this list — it is re-point, because the attachment supplies the same
name. Do not carry Heroku's value across, but do not label it drop either; it has exactly one
label and that label is re-point.

### Grep the source before dropping `HEROKU_*`

Dropping them is right. Dropping them *without looking* is not. Anything in the app reading one
gets `nil` and carries on:

```bash
grep -rn 'ENV\["HEROKU_' app lib bin config
```

For each hit, decide what supplies the value now. The common one is `HEROKU_SLUG_COMMIT` for a
deploy/revision marker: Hatchbox writes a **`REVISION`** file into the release root, so read that
instead. A blank revision breaks nothing at deploy time and is invisible until someone needs to
know what is running.

Check the Heroku side too before calling it a regression — `HEROKU_SLUG_COMMIT` only exists when
the dyno-metadata labs feature is enabled, so on many apps the value was already blank and the
migration changed nothing.

## re-point — a Hatchbox resource supplies the new value, name unchanged

The skill can fill these in itself; no user input needed.

- `DATABASE_URL` (or whatever `app_attachments[].env_var` reports — read it, do not assume).
- `REDIS_URL` / `REDIS_TLS_URL` — from the Hatchbox `redis` role.

## re-signup — same vendor, new account, name unchanged

Add-ons bucketed **byo** in `references/addons.md`. The Heroku-issued credentials die with the
add-on, so the user signs up with the vendor directly and supplies a new value under the same
variable name. List every one and mark it **needs a value from you** — the skill cannot invent
these, and a migration that silently carries a dead SendGrid key across looks fine until the
first password reset email.

## Judgment calls — pick a label AND state why

These are Heroku idioms that are neither obviously portable nor obviously junk. Silently keeping
or silently dropping one is the failure mode. Each gets a normal label **plus a mandatory Note in
MIGRATION.md** saying what happened to it and why.

| Var | Label | Reason to state |
|---|---|---|
| `RAILS_LOG_TO_STDOUT` | keep | Hatchbox runs app processes under systemd and collects stdout. Dropping it sends logs to `log/production.log`, where nothing reads them |
| `RAILS_SERVE_STATIC_FILES` | keep | Caddy reverse-proxies to the app rather than serving `public/` itself, so Rails must keep serving assets. Drop it only if you have configured Caddy to serve `public/` directly |
| `WEB_CONCURRENCY` | re-point | Do not copy the value. It was sized for a dyno's memory; re-derive it from the Hatchbox server's RAM and say what you set and why |
| `RAILS_MAX_THREADS` | keep | Carry the value, but check it against the database pool size — this is the input to pool sizing, and a mismatch shows up as connection timeouts under load, not at boot |
| `RACK_TIMEOUT_SERVICE_TIMEOUT` | keep **if** `rack-timeout` is in `Gemfile.lock`, else drop | The variable is inert without the gem. Check `local.gems` rather than assuming |
| `LANG` | drop **if** the server's locale is UTF-8, else keep | Run `locale` on the server before dropping it. The risk is **not** the Rails app: requiring `rails` forces `Encoding.default_external`/`default_internal` to UTF-8 (`railties/lib/rails.rb`), so anything loading Rails — `bin/rails runner`, rake tasks, the console — is immune. Exposed instead is any process that runs Ruby *without* loading Rails: a release step or cron entry shelling to plain `ruby`, admin scripts. Those get US-ASCII and raise on the first non-ASCII byte. Because Rails masks it, **you cannot detect this by exercising the app** — probe `Encoding.find("locale")`, which still reports the real locale, not `default_external`, which reports UTF-8 either way |
| `MALLOC_ARENA_MAX` | keep | A glibc knob rather than a Heroku one, so it still applies — but the usual value of `2` was picked to cap RSS on a small dyno. Re-check it against the new server's core count instead of copying it blindly |

If a config var looks like platform tuning but is not in this table, treat it as a judgment call
too: label it, and write the Note.

## Any value that looks like a filesystem path is re-point, never keep

**Check every value for a path shape before labelling it `keep`.** A Heroku app lives at `/app`.
A Hatchbox app lives at `/home/deploy/<app>/current`, with persistent data under
`/home/deploy/<app>/shared`. A path carried across verbatim points at a directory that does not
exist on the new host — or, worse, one that does and is wrong.

Observed on a real migration: `EXPORT_ARCHIVE_ROOT=/app/tmp/exports` was carried over as `keep`.
The pruning script ran against it, reported "4 entries, 1 eligible for pruning", exited zero, and
the deploy went green — while operating on nothing the app owns. Nothing failed. Nothing logged a
warning. It is only visible if you read the value and notice `/app`.

Flag a value as a path if it starts with `/`, or contains `/app/`, `tmp/`, `log/`, `public/` or
`shared/`. For each one decide **where the equivalent lives on the new host**, not whether the
string still parses:

| Heroku | Hatchbox | Note |
|---|---|---|
| `/app/...` | `/home/deploy/<app>/current/...` | Wiped and recreated on every deploy |
| anything that must survive a deploy | `/home/deploy/<app>/shared/...` | Symlinked into each release |
| `/tmp/...` | `/tmp/...` | Same, but now persists across restarts — Heroku's was ephemeral |

The last row is its own trap in reverse. On Heroku a dyno restart emptied the disk, so code that
leaked files was self-cleaning. On a persistent server the same code fills the disk instead.

## keep — carry across verbatim

Everything else: `SECRET_KEY_BASE`, `RAILS_ENV`, `RAILS_MASTER_KEY`, app-specific settings,
third-party keys the user owns directly (Stripe, OpenAI, and so on).

## Setting values means putting them through the conversation

`hatchbox_create_env_vars` takes `value` inline. There is no file input and no reference
indirection, so every secret you set this way — `SECRET_KEY_BASE`, `RAILS_MASTER_KEY`, SMTP
passwords, API tokens — passes through the transcript of whatever agent session is running the
migration, and is stored wherever that transcript is stored.

Say so before doing it, and let the user choose. For a throwaway or staging app it is usually
fine. For production credentials, offer the alternative: **set the sensitive values by hand in the
Hatchbox dashboard**, and use the API only for the non-secret ones. Either way the ledger of
*names* is unaffected, so the Phase 6 verification still works.

## Collisions and readback

`hatchbox_create_env_vars` returns the created records' `id` and `name`. There is **no read
endpoint for env vars** — values can never be read back over the API. Hatchbox's
`create_with_prefix` renames a colliding name (e.g. `FOO` → `RED_FOO`), so always record the
names the create response echoes back rather than the names you sent.

Because values are unverifiable, a stale or truncated secret stays invisible until runtime. The
Phase 6 smoke test must exercise credential-touching paths — send a real email, write to the
storage bucket — not just check that the homepage returns 200.
