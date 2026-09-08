# Troubleshooting

## Asynchronous tools and log polling

`hatchbox_deploy_app`, `hatchbox_restart_app`, every process write, `hatchbox_provision_server`
and `hatchbox_reboot_server` are asynchronous. They return a **log id**. The call returning is
not the operation succeeding.

Poll `hatchbox_get_log` with that `log_id` until the status is terminal — `completed`, `failed`
or `aborted`. Poll every 5 seconds for the first minute, then every 15.

`hatchbox_enable_process` and `hatchbox_disable_process` return **no log id on a no-op** (the
process was already in that state). Absence of a log id there is success, not an error.

## A deploy failed

**Never report a bare "the deploy failed."** Fetch the log body and read it. The common causes,
in the order they actually occur:

| Symptom in the log | Cause |
|---|---|
| `Could not find <gem>` / bundler resolution errors | Ruby version mismatch — check `local.ruby_version` against the server |
| `PG::ConnectionBad` during `post_deploy_script` | The attachment's env var name is not what `database.yml` reads |
| `Redis::CannotConnectError` | No `redis` role on any server in the cluster |
| Asset build failures | Node buildpack did work Hatchbox's build script does not — set `build_script` |
| Deploy reports success, app 502s | No `health_check_uri`, so a booting-but-broken app passed |

## The two 402s

Distinguishable only by message, and they mean different things:

- **Subscription required** — no active subscription. The 7-day trial counts. Nothing works.
  The message names the account: `An active subscription is required for <account name>`. If the
  user has more than one account, check you are using the right `account_id` before sending them
  to billing — this 402 is also what an account they merely belong to, but have not subscribed,
  returns.
- **Payment method required** — subscribed, on trial, no card. Gates `domains#create`,
  `domains#update` and `auto_deploys#create` specifically. Everything else works, so this one
  first appears at Phase 7, having let five phases succeed.

Say which one it is and what unblocks it. "402" alone sends the user to the wrong place.

## A 422 on cron job creation

No server in the cluster carries the `cron` role. Phase 3 was supposed to catch this.

## A 422 on env var creation

The name already exists — almost always because a database attachment created it. Do not retry
with `update`; work out which attachment owns it first, because overwriting a live connection
string points the app at nothing.
