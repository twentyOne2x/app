#!/usr/bin/env bash
# Usage: ./scripts/vercel-logs.sh <deployment-url-or-id> [--since 1h]
# Convenience wrapper around `vercel logs` for quick tailing.

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI is required. Install via \\`npm i -g vercel\\`." >&2
  exit 1
fi

if [ -z "$1" ]; then
  echo "Usage: $0 <deployment-url-or-id> [log-options]" >&2
  exit 1
fi

vercel logs "$@"
