#!/bin/bash
set -e

cd "$(dirname "$0")/android"

echo "Patching android configuration for AGP 8..."

# 1. Add namespace fallback to build.gradle if not already present
if [ -f "build.gradle" ]; then
  if ! grep -q "android.namespace" build.gradle; then
    cat >> build.gradle << 'EOF'

subprojects {
    afterEvaluate { project ->
        if (project.hasProperty("android")) {
            if (project.android.namespace == null) {
                def manifestFile = file("${project.projectDir}/src/main/AndroidManifest.xml")
                if (manifestFile.exists()) {
                    def manifestText = manifestFile.getText('UTF-8')
                    def matcher = manifestText =~ /package="([^"]+)"/
                    if (matcher.find()) {
                        project.android.namespace = matcher.group(1)
                    }
                }
            }
        }
    }
}
EOF
  fi
fi

# 2. Allow cleartext traffic in AndroidManifest.xml
if [ -f "app/src/main/AndroidManifest.xml" ]; then
  if ! grep -q "usesCleartextTraffic" app/src/main/AndroidManifest.xml; then
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' app/src/main/AndroidManifest.xml
  fi
fi

echo "Android patches applied successfully!"
