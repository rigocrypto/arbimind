#!/usr/bin/env bash
#
# Fails if any non-example environment file is tracked by git.
#
# This is the rule that would actually have caught the #381 incident. Five env
# files sat tracked in this public repository -- packages/backend/.env since
# 2026-02-10 -- and content scanning missed them because a line like
# `ADMIN_API_KEY=<14 random chars>` matches no vendor pattern and carries no
# distinctive entropy signature.
#
# Checking whether the file is tracked at all sidesteps that entirely: it does
# not care what is inside, so it cannot be defeated by a value that happens to
# look unremarkable.
#
# .gitignore alone is not sufficient. Ignore rules do not apply to files git is
# already tracking, which is precisely why those five persisted despite every
# one of them being listed.

set -euo pipefail

# Matches: .env  .env.local  .env.production  packages/backend/.env
# Allows:  .env.example  .env.production.example  packages/ui/.env.production.example
tracked_env="$(
  git ls-files \
    | grep -E '(^|/)\.env([.].*)?$' \
    | grep -Ev '\.example$' \
    || true
)"

if [ -n "$tracked_env" ]; then
  echo "ERROR: tracked non-example environment files found."
  echo
  echo "$tracked_env" | sed 's/^/  /'
  echo
  echo "Environment files must never be tracked in this public repository."
  echo "To fix, keeping your local copy on disk:"
  echo
  echo "$tracked_env" | sed 's|^|  git rm --cached |'
  echo
  echo "Then confirm .gitignore covers the path, and commit the removal."
  echo "Store the real values in the deployment platform, and add key names to"
  echo "a *.example template if they need documenting."
  exit 1
fi

echo "OK: no tracked non-example environment files."
