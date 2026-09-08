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

# JSON-emitting commands fall back to null so one missing add-on can't abort the run.
json() { heroku "$@" 2>/dev/null || echo 'null'; }
text() { heroku "$@" 2>/dev/null || true; }

config=$(json config -j --app "$app")
addons=$(json addons --json --app "$app")
domains=$(json domains --json --app "$app")
releases=$(json releases --json --num 1 --app "$app")
formation=$(json api GET "/apps/$app/formation")
app_info=$(json api GET "/apps/$app")
buildpacks=$(text buildpacks --app "$app")
pg_info=$(text pg:info --app "$app")

# `[ -f x ] && var=...` would abort under `set -e` when the file is absent; use if/fi.
read_if_present() { if [ -f "$1" ]; then cat "$1"; fi; }

procfile=$(read_if_present Procfile)
app_json=$(read_if_present app.json)
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
  --argjson formation "$formation" \
  --argjson app "$app_info" \
  --arg buildpacks "$buildpacks" \
  --arg pg_info "$pg_info" \
  --arg procfile "$procfile" \
  --arg app_json "$app_json" \
  --arg puma_config "$puma_config" \
  --arg database_yml "$database_yml" \
  --arg bin_scripts "$bin_scripts" \
  --arg ruby_version "$ruby_version" \
  --argjson puma "$(has_gem puma)" \
  --argjson sidekiq "$(has_gem sidekiq)" \
  --argjson solid_queue "$(has_gem solid_queue)" \
  --argjson rails_12factor "$(has_gem rails_12factor)" \
  '{
    app: $app,
    config: $config,
    addons: $addons,
    domains: $domains,
    releases: $releases,
    formation: $formation,
    buildpacks: $buildpacks,
    pg_info: $pg_info,
    local: {
      procfile: $procfile,
      app_json: $app_json,
      puma_config: $puma_config,
      database_yml: $database_yml,
      bin_scripts: $bin_scripts,
      ruby_version: $ruby_version,
      gems: {
        puma: $puma,
        sidekiq: $sidekiq,
        solid_queue: $solid_queue,
        rails_12factor: $rails_12factor
      }
    }
  }' > "$out"

echo "Wrote $out"
