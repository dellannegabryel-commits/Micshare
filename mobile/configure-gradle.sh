#!/bin/bash
# Configure expo gradle plugin in settings.gradle
set -e

SETTINGS_FILE="settings.gradle"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "settings.gradle not found"
    exit 1
fi

# Always create the correct pluginManagement block
cat > /tmp/plugin_mgmt.gradle << 'EOF'
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

# Check if pluginManagement exists
if grep -q "pluginManagement" "$SETTINGS_FILE"; then
    # Remove existing pluginManagement block and replace
    awk '
    BEGIN { in_block=0; brace_count=0; printed=0 }
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
    END {
        if(!printed) {
            # Read the new pluginManagement and print it first
            while((getline line < "/tmp/plugin_mgmt.gradle") > 0) print line
            close("/tmp/plugin_mgmt.gradle")
        }
    }' "$SETTINGS_FILE" > /tmp/new_settings.gradle
else
    # Prepend pluginManagement
    cat /tmp/plugin_mgmt.gradle "$SETTINGS_FILE" > /tmp/new_settings.gradle
fi

mv /tmp/new_settings.gradle "$SETTINGS_FILE"
echo "pluginManagement configured in settings.gradle"
cat "$SETTINGS_FILE" | head -30
