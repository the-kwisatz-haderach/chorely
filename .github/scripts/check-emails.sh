#!/usr/bin/env bash
# Fails if a tracked file holds an email address outside the allowed domains. The repo is public;
# real addresses (testers, the staging allowlist) belong in gitignored *.auto.tfvars (infra/README.md).
#
# Usage: .github/scripts/check-emails.sh
set -euo pipefail

# Placeholders, service accounts, and sender domains (the app's own and Resend's default).
allowed='@([a-z0-9-]+\.)*(example\.(com|org|net)|chorely\.example|yourdomain\.com|iam\.gserviceaccount\.com|chorely\.mogva\.dev|resend\.dev|anthropic\.com)$'

found=$(git grep -ohIiE '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' | sort -u | grep -viE "$allowed" || true)
if [ -n "$found" ]; then
  echo "Email addresses outside the allowed domains; move them to a gitignored *.auto.tfvars:" >&2
  # Locations, so the fix is one step away.
  while read -r address; do
    git grep -nIF "$address" >&2
  done <<<"$found"
  exit 1
fi
