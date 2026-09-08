# Env var classification

Every key in `inventory.json`'s `config` object gets exactly one of four labels — **keep**,
**drop**, **re-point**, **re-signup**. Put the table in MIGRATION.md with **names and labels
only — never values**.

## drop — Heroku injects these; Hatchbox does not need them

- `PORT` — Hatchbox sets it per process via socket activation.
- `DYNO`, `DYNO_RAM`, `WEB_CONCURRENCY` (if unset by the app itself)
- `HEROKU_*` — all of them, including the dyno-metadata labs vars.
- `DATABASE_URL` — **the attachment supplies this.** Do not carry Heroku's value across.
- Any add-on var whose add-on is bucketed **drop** in `references/addons.md`.

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

## keep — carry across verbatim

Everything else: `SECRET_KEY_BASE`, `RAILS_ENV`, `RAILS_MASTER_KEY`, app-specific settings,
third-party keys the user owns directly (Stripe, OpenAI, and so on).

## Collisions and readback

`hatchbox_create_env_vars` returns the created records' `id` and `name`. There is **no read
endpoint for env vars** — values can never be read back over the API. Hatchbox's
`create_with_prefix` renames a colliding name (e.g. `FOO` → `RED_FOO`), so always record the
names the create response echoes back rather than the names you sent.

Because values are unverifiable, a stale or truncated secret stays invisible until runtime. The
Phase 6 smoke test must exercise credential-touching paths — send a real email, write to the
storage bucket — not just check that the homepage returns 200.
