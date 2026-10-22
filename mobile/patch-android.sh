#!/bin/bash
set -e

cd "$(dirname "$0")/android"

echo "Patching android configuration for AGP 8..."

# 1. Fix root build.gradle
if [ -f "build.gradle" ]; then
  if ! grep -q "REACT_NATIVE_NODE_MODULES_DIR" build.gradle; then
    sed -i '/^plugins {/iext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")ext.compileSdkVersion = 34' build.gradle
    echo "Fixed root build.gradle"
  fi
fi

# 2. Fix app/build.gradle - simple line additions
if [ -f "app/build.gradle" ]; then
  # Add REACT_NATIVE_NODE_MODULES_DIR at project level (after plugins block)
  if ! grep -q "REACT_NATIVE_NODE_MODULES_DIR" app/build.gradle; then
    # Find line with "plugins {" and add after the closing "}"
    sed -i '/^plugins {/,/^}/ { /^}/aext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")ext.compileSdkVersion = 34}' app/build.gradle
    echo "Added REACT_NATIVE_NODE_MODULES_DIR and compileSdkVersion to app/build.gradle"
  fi
  
  # Add compileSdkVersion inside android block
  if ! grep -q "compileSdkVersion" app/build.gradle; then
    sed -i '/^android {/a\    compileSdkVersion 34' app/build.gradle
    echo "Added compileSdkVersion to android block"
  fi
  
  # Add namespace inside android block
  if ! grep -q "namespace" app/build.gradle; then
    sed -i '/^android {/a\    namespace "com.micshare"' app/build.gradle
    echo "Added namespace to android block"
  fi
  
  echo "Fixed app/build.gradle"
fi

# 3. Allow cleartext traffic in AndroidManifest.xml
if [ -f "app/src/main/AndroidManifest.xml" ]; then
  if ! grep -q "usesCleartextTraffic" app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' app/src/main/AndroidManifest.xml
    echo "Added usesCleartextTraffic to AndroidManifest.xml"
  fi
fi

echo "Android patches applied successfully!"
