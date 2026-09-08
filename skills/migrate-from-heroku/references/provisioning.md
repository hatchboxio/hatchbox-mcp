# Phase 3 — provisioning (the handoff)

Creating a cluster and creating a server are **dashboard-only**. `hatchbox_provision_server` only
re-provisions a server that already exists; there is no API call that creates one. This phase is
therefore a handoff, and the skill's job is to make it short and unambiguous rather than to
pretend it can be automated.

## Print a checklist with the values filled in

Never print a generic list. Every field comes from Phase 2's `MIGRATION.md`:

- **Provider and region** — matched to `app.region.name` from the inventory.
- **Server size** — the sizing arithmetic from MIGRATION.md, restated with the number.
- **Roles** — `web`, plus `postgresql`; add `redis` when `local.gems.sidekiq` is true or a
  `REDIS_URL` was classified; add `worker` when the Procfile has any non-`web` long-running
  entry; add `cron` when there are scheduled jobs.

State the roles as a single list the user can check off against the dashboard, and say plainly
that a missing `redis` role means Sidekiq will not boot and a missing `cron` role makes
`hatchbox_create_cron_job` fail with a 422.

## Then poll — do not ask

Asking "are you done?" makes the user the scheduler. Poll instead:

1. `hatchbox_list_account_clusters` with the account id until a cluster appears.
2. `hatchbox_list_servers` with that `cluster_id` until a server reports an active state and the
   roles above.

Report what is still missing between polls — "cluster found, waiting on the server" is useful;
silence is not. Stop polling and hand back to the user after ten minutes with no change.

## Verify before leaving the phase

Confirm the roles actually present against the roles required, and **stop here on a mismatch**
rather than discovering it as a 422 three phases later. A cluster whose only server lacks `cron`
can still create an app, an env var and a database — it just cannot create a cron job, and that
failure arrives long after the cause.
