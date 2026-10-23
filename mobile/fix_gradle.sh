#!/bin/bash
set -e

echo "Fixing build.gradle properties..."

# Fix root build.gradle
if [ -f "android/build.gradle" ]; then
  if ! grep -q "REACT_NATIVE_NODE_MODULES_DIR" android/build.gradle; then
    sed -i '/^plugins {/a\
ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")\
ext.compileSdkVersion = 34' android/build.gradle
    echo "Fixed root build.gradle"
  fi
fi

# Fix app/build.gradle
if [ -f "android/app/build.gradle" ]; then
  # Add REACT_NATIVE_NODE_MODULES_DIR and compileSdkVersion at project level (after plugins block)
  if ! grep -q "REACT_NATIVE_NODE_MODULES_DIR" android/app/build.gradle; then
    sed -i '/^plugins {/a\
ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")\
ext.compileSdkVersion = 34' android/app/build.gradle
    echo "Added REACT_NATIVE_NODE_MODULES_DIR and compileSdkVersion to app/build.gradle"
  fi
  
  # Add compileSdkVersion inside android block
  if ! grep -q "compileSdkVersion" android/app/build.gradle; then
    sed -i '/^android {/a\    compileSdkVersion 34' android/app/build.gradle
    echo "Added compileSdkVersion to android block"
  fi
  
  # Add namespace inside android block
  if ! grep -q "namespace" android/app/build.gradle; then
    sed -i '/^android {/a\    namespace "com.micshare"' android/app/build.gradle
    echo "Added namespace to android block"
  fi
  
  echo "Fixed app/build.gradle"
fi

# Fix AndroidManifest.xml
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
  if ! grep -q "usesCleartextTraffic" android/app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' android/app/src/main/AndroidManifest.xml
    echo "Fixed AndroidManifest.xml"
  fi
fi

echo "All fixes applied!"
