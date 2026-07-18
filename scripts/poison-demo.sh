#!/usr/bin/env bash
# Cause P2 (see README): app-rendered 404s stored into never-expiring ISR entries.
#   flaky SSR (50% fatal-404, simulating CMS rate limits)
#   + publish-style tag purges (forced re-population)
#   + isr: true (never-expiring entries)
#   = a permanently poisoned route serving 404 with x-vercel-cache: HIT.
# The twin route /flaky-ttl (isr: 60) shows the contrast: same flaky page,
# but a finite TTL lets revalidation retry and heal.
#
# Usage: ./scripts/poison-demo.sh https://<deployment>.vercel.app
set -u
B="${1:?usage: ./scripts/poison-demo.sh <deployment-url>}"

hit() {
  curl -s -D /tmp/pd.h -o /tmp/pd.b -H 'accept: text/html' "$B$1"
  local st ca ra
  st=$(head -1 /tmp/pd.h | awk '{print $2}')
  ca=$(tr -d '\r' </tmp/pd.h | awk 'tolower($1)=="x-vercel-cache:"{print $2}')
  ra=$(grep -oE 'CMS story loaded at <strong>[^<]*' /tmp/pd.b | sed 's/.*<strong>//')
  echo "$st ${ca:--} ${ra:-(404 body)}"
}

purge() {
  curl -s -X POST -H 'content-type: application/json' \
    -d "{\"tags\":[\"page:$1\"]}" "$B/api/invalidate" >/dev/null
}

# publish-like cycle: purge tag → hit (serves stale, triggers refresh) →
# settle → hit again (the freshly re-populated entry)
cycle() { purge "$1"; curl -s -o /dev/null -H 'accept: text/html' "$B$1"; sleep 4; hit "$1"; }

seek() { # drive route $1 into state $2 (200|404) via publish cycles
  for i in $(seq 1 14); do
    r=$(cycle "$1")
    echo "  cycle $i: $r"
    case "$r" in "$2"*) return 0 ;; esac
  done
  return 1
}

echo "== phase 0: establish a HEALTHY cached entry on both routes"
seek /flaky 200 || { echo "could not establish healthy entry (unlucky run) — rerun"; exit 1; }
seek /flaky-ttl 200 || exit 1

echo
echo "== phase 1: poison both routes via publish-style purge cycles"
seek /flaky 404 && echo ">>> /flaky poisoned"
seek /flaky-ttl 404 && echo ">>> /flaky-ttl poisoned"

echo
echo "== phase 2: watch 3 minutes — isr:true stays dead, isr:60 heals"
for i in $(seq 1 9); do
  printf '%s  /flaky      %s\n' "$(date -u +%H:%M:%SZ)" "$(hit /flaky)"
  printf '%s  /flaky-ttl  %s\n' "$(date -u +%H:%M:%SZ)" "$(hit /flaky-ttl)"
  sleep 20
done
echo
echo "Expected: /flaky serves 404 cache=HIT forever (same frozen entry);"
echo "/flaky-ttl flips back to 200 once a >60s revalidation retry succeeds."
