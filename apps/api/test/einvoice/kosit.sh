#!/bin/sh
# Validates test/einvoice/golden with the KoSIT validator and the XRechnung configuration.
# Needs docker, curl, unzip and sha256sum; the downloads are cached under ~/.cache/zeit-kosit.
set -eu

validator_version=1.6.3
validator_sha256=799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9
config_release=2026-08-31
config_sha256=2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8
jre=eclipse-temurin:21-jre@sha256:49e21e16e3c86eb7816a44a67549910ed090fbeb40c29c525d58bf5e02e91b0f

# git bash would rewrite the container paths into windows paths
export MSYS_NO_PATHCONV=1

here=$(cd "$(dirname "$0")" && pwd)
cache="$HOME/.cache/zeit-kosit"
jar="validator-$validator_version-standalone.jar"
zip="xrechnung-3.0.2-validator-configuration-$config_release.zip"
mkdir -p "$cache"
cd "$cache"

if [ ! -f "$jar" ]; then
	curl -fsSL -o "$jar.part" "https://github.com/itplr-kosit/validator/releases/download/v$validator_version/$jar"
	echo "$validator_sha256  $jar.part" | sha256sum -c -
	mv "$jar.part" "$jar"
fi
if [ ! -d "config-$config_release" ]; then
	curl -fsSL -o "$zip" "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v$config_release/$zip"
	echo "$config_sha256  $zip" | sha256sum -c -
	unzip -q -d "config-$config_release" "$zip"
	rm "$zip"
fi

# under the cache rather than /tmp, docker desktop does not see the /tmp of git bash
reports=$(mktemp -d "$cache/reports.XXXXXX")
trap 'rm -rf "$reports"' EXIT

# exits with the number of rejected documents
docker run --rm --network none \
	-v "$cache:/kosit:ro" -v "$here/golden:/golden:ro" -v "$reports:/reports" \
	"$jre" java -jar "/kosit/$jar" \
	-s "/kosit/config-$config_release/scenarios.xml" -r "/kosit/config-$config_release" \
	-o /reports /golden

set -- "$reports"/*-report.xml
if [ ! -f "$1" ]; then
	echo "the validator wrote no reports" >&2
	exit 1
fi
# acceptance still lets warnings through, the golden files have to be clean
if grep -l '<rep:message[^>]*level="warning"' "$@"; then
	echo "the files above carry warnings" >&2
	exit 1
fi
