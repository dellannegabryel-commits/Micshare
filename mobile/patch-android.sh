#!/bin/bash
set -e

cd "$(dirname "$0")/android"

echo "Patching android configuration for AGP 8..."

# 1. Add properties to app/build.gradle
if [ -f "app/build.gradle" ]; then
  # Add REACT_NATIVE_NODE_MODULES_DIR at project level if not present
  if ! grep -q "REACT_NATIVE_NODE_MODULES_DIR" app/build.gradle; then
    sed -i '/^android {/iext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")' app/build.gradle
    echo "Added REACT_NATIVE_NODE_MODULES_DIR to app/build.gradle"
  fi
  
  # Add compileSdkVersion inside android block if not present
  if ! grep -q "compileSdkVersion" app/build.gradle; then
    sed -i '/^android {/a\    compileSdkVersion 34' app/build.gradle
    echo "Added compileSdkVersion to app/build.gradle"
  fi
  
  # Add namespace inside android block if not present
  if ! grep -q "namespace" app/build.gradle; then
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
