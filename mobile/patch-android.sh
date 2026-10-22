#!/bin/bash
set -e

cd "$(dirname "$0")/android"

echo "Patching android configuration for AGP 8..."

# 1. Fix namespace in app/build.gradle instead of root build.gradle
if [ -f "app/build.gradle" ]; then
  if ! grep -q "namespace" app/build.gradle; then
    # Add namespace after android { line
    sed -i '/^android {/a\    namespace "com.micshare"' app/build.gradle
    echo "Added namespace to app/build.gradle"
  fi
fi

# 2. Allow cleartext traffic in AndroidManifest.xml
if [ -f "app/src/main/AndroidManifest.xml" ]; then
  if ! grep -q "usesCleartextTraffic" app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' app/src/main/AndroidManifest.xml
    echo "Added usesCleartextTraffic to AndroidManifest.xml"
  fi
fi

echo "Android patches applied successfully!"
