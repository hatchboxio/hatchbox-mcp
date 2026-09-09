#!/usr/bin/env bash
# Read-only inventory of a Heroku app. Writes JSON; changes nothing on Heroku.
set -euo pipefail

app="${1:-}"
if [ -z "$app" ]; then
  echo "usage: heroku_inventory.sh <heroku-app-name>" >&2
  exit 64
fi

command -v heroku >/dev/null || { echo "heroku CLI not found" >&2; exit 69; }
command -v jq >/dev/null     || { echo "jq not found (brew install jq)" >&2; exit 69; }

out="${HATCHBOX_INVENTORY_OUT:-.hatchbox/inventory.json}"
mkdir -p "$(dirname "$out")"

# A failed command falls back to null so one missing add-on can't abort the run — but the
# fallback is RECORDED. A silent null is indistinguishable from "there was nothing there",
# which is the same failure the Phase 2 completeness gate exists to prevent.
warnings=""
json() { # json <label> <heroku args...>
  local label="$1"; shift
  local out
  if out=$(heroku "$@" 2>/dev/null) && [ -n "$out" ]; then
    printf '%s' "$out"
  else
    warnings="${warnings}${label} "
    echo "warning: 'heroku $*' failed; ${label} is null" >&2
    echo 'null'
  fi
}
# Strip ANSI colour codes — the CLI emits them even when piped, and they are noise to
# whatever reads buildpacks/pg_info downstream.
text() { heroku "$@" 2>/dev/null | sed $'s/\033\[[0-9;]*m//g' || true; }

config=$(json config config -j --app "$app")
addons=$(json addons addons --json --app "$app")
domains=$(json domains domains --json --app "$app")
releases=$(json releases releases --json --num 1 --app "$app")
# There is no `heroku api` subcommand. apps:info --json carries both the app record and
# the running dynos, which is what the formation is derived from below.
apps_info=$(json apps_info apps:info --json --app "$app")
buildpacks=$(text buildpacks --app "$app")
pg_info=$(text pg:info --app "$app")

# `[ -f x ] && var=...` would abort under `set -e` when the file is absent; use if/fi.
read_if_present() { if [ -f "$1" ]; then cat "$1"; fi; }

procfile=$(read_if_present Procfile)
app_json=$(read_if_present app.json)
profile=$(read_if_present .profile)
package_json=$(read_if_present package.json)

# Anything in the repo that writes .profile.d is a generator whose OUTPUT is invisible
# (gitignored, created at build time) but whose SOURCE is not. Covers package.json
# heroku-postbuild, bin/ scripts, and the Rakefile/lib/tasks assets:precompile enhance
# idiom that an importmap or propshaft app uses when it has no package.json at all.
profile_d_writers=$(grep -rl '\.profile\.d' Rakefile lib/tasks bin package.json 2>/dev/null | tr '\n' ' ' || true)
puma_config=$(read_if_present config/puma.rb)
database_yml=$(read_if_present config/database.yml)
bin_scripts=$(ls bin 2>/dev/null | tr '\n' ' ')

ruby_version=""
if [ -f Gemfile.lock ]; then
  ruby_version=$(awk '/^RUBY VERSION/{getline; gsub(/[ ]+/,""); sub(/^ruby/,""); sub(/p[0-9]+$/,""); print}' Gemfile.lock)
fi

has_gem() {
  if [ -f Gemfile.lock ] && grep -qE "^ {4}$1 \(" Gemfile.lock; then echo true; else echo false; fi
}

jq -n \
  --argjson config "$config" \
  --argjson addons "$addons" \
  --argjson domains "$domains" \
  --argjson releases "$releases" \
  --argjson apps_info "$apps_info" \
  --arg warnings "$warnings" \
  --arg buildpacks "$buildpacks" \
  --arg pg_info "$pg_info" \
  --arg procfile "$procfile" \
  --arg app_json "$app_json" \
  --arg profile "$profile" \
  --arg package_json "$package_json" \
  --arg profile_d_writers "$profile_d_writers" \
  --arg puma_config "$puma_config" \
  --arg database_yml "$database_yml" \
  --arg bin_scripts "$bin_scripts" \
  --arg ruby_version "$ruby_version" \
  --argjson puma "$(has_gem puma)" \
  --argjson sidekiq "$(has_gem sidekiq)" \
  --argjson solid_queue "$(has_gem solid_queue)" \
  --argjson rails_12factor "$(has_gem rails_12factor)" \
  --argjson rack_timeout "$(has_gem rack-timeout)" \
  '{
    app: ($apps_info.app // null),
    formation: (
      if $apps_info == null or $apps_info.dynos == null then null
      else ($apps_info.dynos | group_by(.type)
            | map({type: .[0].type, size: .[0].size, quantity: length}))
      end
    ),
    uncollected: ($warnings | split(" ") | map(select(. != ""))),
    config: $config,
    addons: $addons,
    domains: $domains,
    releases: $releases,
    buildpacks: $buildpacks,
    pg_info: $pg_info,
    local: {
      procfile: $procfile,
      app_json: $app_json,
      profile: $profile,
      package_json: $package_json,
      profile_d_writers: $profile_d_writers,
      puma_config: $puma_config,
      database_yml: $database_yml,
      bin_scripts: $bin_scripts,
      ruby_version: $ruby_version,
      gems: {
        puma: $puma,
        sidekiq: $sidekiq,
        solid_queue: $solid_queue,
        rails_12factor: $rails_12factor,
        rack_timeout: $rack_timeout
      }
    }
  }' > "$out"

echo "Wrote $out"
