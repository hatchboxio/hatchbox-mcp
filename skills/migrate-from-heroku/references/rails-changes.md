# Phase 5 — repo changes

Branch `hatchbox-migration`. Make the edits, run the test suite, show the diff. **Nothing is
pushed or merged without approval.**

Most Rails 8 apps need very little here. Resist inventing work.

## What usually changes

| Change | When | Why |
|---|---|---|
| Remove `rails_12factor` | Only if present in `Gemfile.lock` | Abandoned since Rails 4 |
| Confirm `config/puma.rb` binds `$PORT` | Always check, rarely change | Hatchbox uses socket activation against the standard binding |
| Confirm `config/database.yml` reads the attachment's env var | Always | If it hardcodes `DATABASE_URL` and the attachment landed as `RED_DATABASE_URL`, it connects to nothing |
| Add a health endpoint | If `health_check_uri` was set and none exists | Rails 8 ships `/up` by default |

**Do not lead with `rails_12factor`.** It cannot be installed on a modern Rails app, so on
anything recent the advice is unreachable. The modern equivalents are `RAILS_LOG_TO_STDOUT` and
`RAILS_SERVE_STATIC_FILES`, which are env vars, not gems, and were classified in Phase 2.

## Filesystem writers

Heroku's ephemeral disk hides these; a persistent server does not, and the failure inverts. Code
that wrote to `public/system` or `tmp/` and silently lost the files now silently *keeps* them,
filling the disk. Phase 2 flagged any it found as a blocker; if one is being migrated
deliberately, note where the data now accumulates.

## Running the suite

Run the app's own test command, not a guessed one — read it from `bin/ci`, `Rakefile` or the
README. Report failures verbatim. **A red suite stops the phase.** A migration is the worst
possible time to be unsure whether the app worked before you touched it.
