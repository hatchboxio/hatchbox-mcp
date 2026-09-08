# Processes — detect, then reconcile

## What Hatchbox creates by itself

`Apps::DetectProcesses` runs on the **first deploy**, reads `Gemfile.lock` from the deployed
release, and creates:

| Detected | name | start_command | roles | socket |
|---|---|---|---|---|
| rails | `server` | `bin/rails server -b 127.0.0.1 -p $PORT` | web | yes |
| puma, no rails | `server` | `bundle exec --keep-file-descriptors puma -b tcp://127.0.0.1:$PORT` | web | yes |
| config.ru only | `server` | `bundle exec rackup -p $PORT` | web | |
| sidekiq | `sidekiq` | `bundle exec sidekiq` | worker | |
| solid_queue | `solid_queue` | `bin/jobs` | worker | |

Detection **skips any name that already exists.** Creating a `server` or `sidekiq` process before
the first deploy suppresses it. So: deploy first, then reconcile.

## Reconcile in three passes

Call `hatchbox_list_processes` with `app_id` and compare against the Procfile.

**Pass 1 — drop.** The Heroku `web:` line is not translated. Hatchbox's socket-activated `server`
process replaces it. Do not create anything for it.

**Pass 2 — update.** For each Procfile entry whose command differs from its detected counterpart,
`hatchbox_update_process` with `app_id`, `process_id` and the corrected `start_command`. The usual
case is `worker:` — detection creates a bare `bundle exec sidekiq`, and the Procfile's real
command carries queue flags. A missed update produces a worker that runs but silently ignores
every named queue.

**Pass 3 — create.** *This is the pass that gets skipped.* Every Procfile entry with **no**
detected counterpart needs `hatchbox_create_process` with `app_id`, `name`, `start_command`.
Second Sidekiq processes for other queues, clock processes, anything bespoke.

Set `roles: ["worker"]` for background processes — not `server_id`; the two are mutually
exclusive and pinning to a server means the process does not move when the cluster grows. Leave
`socket` alone: only one process per app may set it, and the detected `server` already has it.

## Enumerate pass 3 explicitly — do not leave it implicit

Before finishing, list every Procfile entry and what happened to it: dropped, updated, created,
or already correct. A reconciliation that only updates detected processes **looks like it
worked** — the web process serves, the worker consumes its default queue — while every process
that needed creating silently does not exist. Nothing errors. The output is the only place that
absence becomes visible.

Process writes are asynchronous: each returns a log id, and each must be polled to a terminal
state before the next.
