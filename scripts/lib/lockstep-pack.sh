#!/usr/bin/env bash
# The pack PR a lockstep pair merges with, from the app PR's body (`Pack: #N` lines) and
# an optional explicit pack PR number. Exactly one pack, or a refusal on stderr:
#   - no `Pack:` line → refused;
#   - one line → that pack (an explicit pack must match it);
#   - two or more (a body that pasted another PR's body) → refused, unless the explicit
#     pack is one of them.
# Prints the pack PR number. Sourced by scripts/lockstep-merge.sh.

resolve_pack_pr() {
  local body="$1" explicit="${2:-}"
  local named
  named="$(grep -oE '^Pack: #[0-9]+' <<<"$body" | grep -oE '[0-9]+' | sort -u || true)"
  local count
  count="$(grep -c . <<<"$named" || true)"
  if [ -z "$named" ]; then
    echo "✗ the app PR names no pack PR (add one line 'Pack: #<number>' to its description)." >&2
    return 1
  fi
  if [ -n "$explicit" ]; then
    if ! grep -qx "$explicit" <<<"$named"; then
      echo "✗ pack #$explicit is not the one the app PR names ($(sed 's/^/#/' <<<"$named" | paste -sd' ' -))." >&2
      return 1
    fi
    echo "$explicit"
    return 0
  fi
  if [ "$count" -gt 1 ]; then
    echo "✗ the app PR names several packs ($(sed 's/^/#/' <<<"$named" | paste -sd' ' -)): keep one 'Pack:' line, or pass the pack PR as the second argument." >&2
    return 1
  fi
  echo "$named"
}
