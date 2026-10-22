#!/bin/bash
# Configure expo gradle plugin in settings.gradle
set -e

SETTINGS_FILE="settings.gradle"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "settings.gradle not found"
    exit 1
fi

# Read the original content (without any existing pluginManagement)
ORIGINAL_CONTENT=$(cat "$SETTINGS_FILE" | awk '
BEGIN { in_block=0; brace_count=0 }
/pluginManagement/ && !in_block { in_block=1; brace_count=0; next }
in_block {
    for(i=1; i<=length($0); i++) {
        c=substr($0,i,1)
        if(c=="{") brace_count++
        if(c=="}") brace_count--
    }
    if(brace_count==0) { in_block=0; next }
    next
}
{ print }
')

# Write new settings.gradle with pluginManagement at the top
cat > "$SETTINGS_FILE" << 'EOF'
pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id == "expo-module-gradle-plugin") {
                useModule("expo:expo-module-gradle-plugin:2.0.0")
            }
        }
    }
}
EOF

# Append the original content
echo "$ORIGINAL_CONTENT" >> "$SETTINGS_FILE"

echo "pluginManagement configured in settings.gradle"
cat "$SETTINGS_FILE" | head -30
