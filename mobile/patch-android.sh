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

# 2. Fix app/build.gradle using Python script
if [ -f "app/build.gradle" ]; then
  cat > fix_app_build.py << 'PYEOF'
import re

with open('app/build.gradle', 'r') as f:
    content = f.read()

# Add REACT_NATIVE_NODE_MODULES_DIR at project level if not present
if 'REACT_NATIVE_NODE_MODULES_DIR' not in content:
    content = re.sub(
        r'(plugins\s*\{[^}]+\})',
        r'

ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")
ext.compileSdkVersion = 34
',
        content,
        count=1
    )

# Add compileSdkVersion inside android block if not present
if 'compileSdkVersion' not in content:
    content = re.sub(
        r'(android\s*\{)',
        r'
    compileSdkVersion 34',
        content,
        count=1
    )

# Add namespace inside android block if not present
if 'namespace' not in content:
    content = re.sub(
        r'(android\s*\{)',
        r'
    namespace "com.micshare"',
        content,
        count=1
    )

with open('app/build.gradle', 'w') as f:
    f.write(content)

print("Fixed app/build.gradle")
PYEOF

  python3 fix_app_build.py
  rm fix_app_build.py
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
