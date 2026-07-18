#!/usr/bin/env bash
# Cause P3 (docs/p3-auth.md), scoped to /secret: basic auth on an ISR route's
# render path.
#   availability: unauthenticated population 401s → non-cacheable →
#                 FUNCTION_INVOCATION_FAILED, route permanently dead
#   confidentiality: one authenticated render populates the SHARED cache →
#                 served to everyone without credentials (auth bypass)
#
# Usage: ./scripts/auth-demo.sh https://<deployment>.vercel.app
set -u
B="${1:?usage: ./scripts/auth-demo.sh <deployment-url>}"
CREDS="repro:repro-password-401" # public demo credentials (set as Vercel env)

hit() { # [-u creds] — prints status/cache/x-vercel-error/content marker
  curl -s -D /tmp/ad.h -o /tmp/ad.b -H 'accept: text/html' "$@" "$B/secret"
  local st ca er mk
  st=$(head -1 /tmp/ad.h | awk '{print $2}')
  ca=$(tr -d '\r' </tmp/ad.h | awk 'tolower($1)=="x-vercel-cache:"{print $2}')
  er=$(tr -d '\r' </tmp/ad.h | awk 'tolower($1)=="x-vercel-error:"{print $2}')
  mk=$(grep -oE 'isr: true behind basic auth' /tmp/ad.b | head -1)
  echo "status=$st cache=${ca:--} error=${er:--} ${mk:+CONTENT: $mk}"
}

echo "== 1. availability failure: unauthenticated visits can never populate"
for n in 1 2 3; do echo "  unauth visit $n: $(hit)"; sleep 2; done

echo "== 2. one authenticated visit populates the shared cache"
echo "  authed visit:   $(hit -u "$CREDS")"
sleep 3

echo "== 3. confidentiality failure: the 'protected' page is now public"
for n in 1 2; do echo "  unauth visit $n: $(hit)"; sleep 2; done

echo "== 4. a publish-style purge kills it again (permanently — isr: true)"
curl -s -X POST -H 'content-type: application/json' \
  -d '{"tags":["page:/secret"]}' "$B/api/invalidate" >/dev/null
sleep 3
for n in 1 2; do echo "  unauth visit $n: $(hit)"; sleep 2; done
echo
echo "Expected: 1) 401 FUNCTION_INVOCATION_FAILED MISS ×3 → 2) 200 →"
echo "3) 200 HIT without credentials → 4) 401 MISS again, forever."