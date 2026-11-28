#!/bin/bash
# Builds "MultiCode.app" for this Mac (Apple Silicon) and zips it into dist/.
# Needs: Node 20+, Xcode Command Line Tools (swiftc, codesign).
set -euo pipefail
cd "$(dirname "$0")/.."
swiftc -O helper/windowwatch.swift -o resources/windowwatch
npm run build
npx electron-builder --mac --arm64
APP="dist/mac-arm64/MultiCode.app"
codesign --force --deep -s - "$APP"   # ad-hoc signature so Apple Silicon runs it (no Apple developer account)
ditto -c -k --keepParent "$APP" "dist/MultiCode-mac-arm64.zip"
echo "Pronto: $APP e dist/MultiCode-mac-arm64.zip"
