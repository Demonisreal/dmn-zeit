#!/bin/sh
set -eu

verapdf=ghcr.io/verapdf/cli:v1.31.184@sha256:02b4ef6dab269187991890deb4d91f633f10e39461dcd2ede2c3b1d53b88ba08

here=$(cd "$(dirname "$0")" && pwd)
cache="$HOME/.cache/zeit-verapdf"
mkdir -p "$cache"

pdfs=$(mktemp -d "$cache/pdfs.XXXXXX")
trap 'rm -rf "$pdfs"' EXIT

cd "$here/../.."
VERAPDF_PDF_DIR="$pdfs" pnpm exec vitest run test/einvoice/zugferd-pdf.spec.ts
chmod -R a+rX "$pdfs"

status=0
report=$(MSYS_NO_PATHCONV=1 docker run --rm --network none -v "$pdfs:/pdfs:ro" "$verapdf" \
	-f 3b --format text -v /pdfs) || status=$?
printf '%s\n' "$report"

failed=$(printf '%s\n' "$report" | grep -c '^FAIL' || true)
if [ "$failed" -gt 0 ]; then
	exit 1
fi
exit "$status"
