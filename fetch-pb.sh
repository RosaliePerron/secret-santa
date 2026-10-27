#!/bin/sh
# Downloads the PocketBase binary pinned in PB_VERSION into ./pocketbase
set -eu
v=$(cat "$(dirname "$0")/PB_VERSION")
os=$(uname -s | tr '[:upper:]' '[:lower:]')
case $(uname -m) in x86_64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 1 ;; esac
url="https://github.com/pocketbase/pocketbase/releases/download/v$v/pocketbase_${v}_${os}_${arch}.zip"
tmp=$(mktemp -d)
curl -fsSL "$url" -o "$tmp/pb.zip"
unzip -o -q "$tmp/pb.zip" pocketbase -d "$(dirname "$0")"
rm -rf "$tmp"
echo "pocketbase v$v ready"
