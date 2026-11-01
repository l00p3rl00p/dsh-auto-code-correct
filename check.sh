#!/bin/sh
# DSH post-tool hook: after an edit or write, lint the file the agent just changed.
# Reads one JSON line on stdin: {"args":{"path":...},"cwd":...}. Writes findings to
# $DSH_HOME/auto-code-correct/findings.txt. Always exits 0: a post-tool hook cannot block.
set -u
DSH_DIR="${DSH_HOME:-/home/qdev/.dsh}"
OUT="$DSH_DIR/auto-code-correct/findings.txt"
mkdir -p "$(dirname "$OUT")"

# Pull the working directory and file path out of the JSON without any other tools.
PARSED=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const a=j.args||{};process.stdout.write((j.cwd||".")+"\t"+(a.path||a.file_path||""))}catch(e){process.stdout.write("\t")}})')
CWD=$(printf '%s' "$PARSED" | cut -f1)
FILE=$(printf '%s' "$PARSED" | cut -f2)
[ -n "$FILE" ] || exit 0

case "$FILE" in
  *.py) CHECK=python ;;
  *.sh) CHECK=shell ;;
  *) exit 0 ;;
esac

cd "$CWD" 2>/dev/null || cd /
{
  printf 'File: %s\n' "$FILE"
  if [ "$CHECK" = python ]; then
    ruff check --output-format concise "$FILE" 2>&1
    ty check "$FILE" 2>&1
  else
    shellcheck "$FILE" 2>&1
  fi
  printf -- '--- end of check (exit findings are advisory) ---\n'
} > "$OUT" 2>&1
exit 0
