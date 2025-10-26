#!/usr/bin/env bash
set -euo pipefail

# log-run.sh COMPONENT COMMAND...
# - Resolves today's log filepath for COMPONENT from ops/logging.components.json
# - Ensures directory exists
# - Runs COMMAND with stdout/stderr tee'd to file and to the terminal
# - Uses line-buffered stdbuf to reduce buffering
# - Ensures file mode 0644 after first write

here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
manif="${LOG_COMPONENTS:-$repo/ops/logging.components.json}"
logdir="${LOG_DIR:-$repo/logs}"

component="${1:-}"
if [[ -z "$component" ]]; then
  echo "usage: $0 <component> <command> [args...]" >&2
  exit 2
fi
shift

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <component> <command> [args...]" >&2
  exit 2
fi

# Read pattern for component from manifest via node (robust JSON parsing)
pattern=$(MANIF="$manif" COMP="$component" node -e '
  const fs=require("fs");
  const m=process.env.MANIF;
  const c=process.env.COMP;
  try{
    const j=JSON.parse(fs.readFileSync(m,"utf8"));
    const arr=Array.isArray(j.components)?j.components:[];
    const item=arr.find(x=>String(x.name)===String(c));
    if(item && item.pattern){ process.stdout.write(String(item.pattern)); }
  }catch(e){}
' ) || true

# Fallback if component not found in manifest
if [[ -z "${pattern:-}" ]]; then
  pattern="/var/log/${component}/${component}-%DATE%.log"
fi

# Expand %DATE%
DateStr=$(date +%F)
logpath="$pattern"
logpath="${logpath//%DATE%/$DateStr}"

# Map container-style paths to host-side LOG_DIR for local dev
case "$logpath" in
  /var/log/core/*)       rel="${logpath#/var/log/core/}";       out="$logdir/core/$rel";;
  /var/log/web/*)        rel="${logpath#/var/log/web/}";        out="$logdir/web/$rel";;
  /var/log/postgresql/*) rel="${logpath#/var/log/postgresql/}"; out="$logdir/postgres/$rel";;
  /var/log/nats/*)       rel="${logpath#/var/log/nats/}";       out="$logdir/nats/$rel";;
  /var/log/ops/*)        rel="${logpath#/var/log/ops/}";        out="$logdir/ops/$rel";;
  /var/log/*)            rel="${logpath#/var/log/}";            out="$logdir/$rel";;
  *)                     out="$repo/$logpath";;
esac

mkdir -p "$(dirname "$out")"

# Ensure file exists; set open perms
: > "$out" || touch "$out"
chmod 0644 "$out" || true

# Run command, tee to file and terminal (with minimal buffering if available)
set +e
set -o pipefail
status=0
if command -v stdbuf >/dev/null 2>&1; then
  stdbuf -oL -eL "$@" 2>&1 | tee -a "$out"
  status=${PIPESTATUS[0]}
else
  "$@" 2>&1 | tee -a "$out"
  status=${PIPESTATUS[0]}
fi
set -e

chmod 0644 "$out" || true
echo "log-run: wrote to $out" >&2
exit "$status"
