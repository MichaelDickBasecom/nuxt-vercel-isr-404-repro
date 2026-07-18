#!/usr/bin/env bash
# Post-deploy probe for cause P1 in the wild (docs/p1-carrier-loss.md):
# watches a deployment for a cached -isr 404.
#
# Usage:
#   ./scripts/probe.sh https://<deployment>.vercel.app            # one pass
#   ./scripts/probe.sh https://<deployment>.vercel.app --burst    # + concurrent first-hit burst
#   ./scripts/probe.sh https://<deployment>.vercel.app --watch 30 # repeat every 30s, append to probe.log
#
# Run the --burst variant IMMEDIATELY after a fresh deploy (cold cache) — the
# suspected trigger is a malformed first/revalidation invocation poisoning the
# prerender cache, so the first requests are the interesting ones.
set -u
BASE="${1:?usage: ./scripts/probe.sh <deployment-url> [--burst|--watch <sec>]}"
MODE="${2:-}"

probe() {
  local path="$1"; shift
  local tmp; tmp=$(mktemp)
  local headers; headers=$(curl -sS -D - -o "$tmp" -H 'accept: text/html' "$@" "$BASE$path" 2>&1)
  local status cache vid
  status=$(printf '%s' "$headers" | head -1 | awk '{print $2}')
  cache=$(printf '%s' "$headers" | tr -d '\r' | awk 'tolower($1)=="x-vercel-cache:"{print $2}')
  vid=$(printf '%s' "$headers" | tr -d '\r' | awk 'tolower($1)=="x-vercel-id:"{print $2}')
  # What did the SERVER think it was rendering? (embedded at SSR time)
  local saw
  saw=$(grep -oE '(event\.path\)</td><td><strong>|raw req\.url: <strong>)[^<]*' "$tmp" | head -1 | sed 's/.*<strong>//')
  local marker
  marker=$(grep -oE 'Page not found: [^<"]*|ERROR 404|— lang: [^ <]*|isr: [0-9]+[^<]*' "$tmp" | head -1)
  printf '%s  %-38s status=%-4s cache=%-12s saw=%-24s %s  %s\n' \
    "$(date -u +%H:%M:%SZ)" "$path" "${status:-ERR}" "${cache:--}" "${saw:--}" "${marker:--}" "${vid:--}"
  rm -f "$tmp"
}

pass() {
  echo "--- baseline (original report shape)"
  probe /schedule
  echo "--- dynamic param (multiple capture groups)"
  probe /users/42
  probe /users/43
  echo "--- catch-all + overlapping override"
  probe /catchall/foo
  probe /catchall/foo/bar
  probe /catchall/special
  echo "--- passQuery variants"
  probe /schedule-pq
  probe "/query?lang=es"
  probe "/query?lang=de"
  probe /query
  echo "--- nested"
  probe /nested/deep
  echo "--- controls"
  probe /about
  probe /
  echo "--- payload route (nitro#4047)"
  probe /schedule/_payload.json
  probe /users/42/_payload.json
  echo "--- internal -isr path from OUTSIDE (known: cacheable 404 on own key)"
  probe /schedule-isr
}

if [ "$MODE" = "--burst" ]; then
  echo "=== concurrent cold-cache burst on /schedule (cache-population race)"
  for i in 1 2 3 4 5 6 7 8; do
    ( probe /schedule ) &
  done
  wait
  echo
fi

if [ "$MODE" = "--watch" ]; then
  every="${3:-30}"
  echo "appending to probe.log every ${every}s — watch for status=404 + cache=HIT; ctrl-c to stop"
  while true; do pass | tee -a probe.log; sleep "$every"; done
else
  pass
fi
