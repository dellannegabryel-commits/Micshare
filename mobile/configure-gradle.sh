#!/bin/bash
# Configure expo gradle plugin in settings.gradle
set -e

SETTINGS_FILE="settings.gradle"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "settings.gradle not found"
    exit 1
fi

if grep -q "pluginManagement" "$SETTINGS_FILE"; then
    echo "pluginManagement already configured"
    exit 0
fi

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

cat /tmp/plugin_mgmt.gradle "$SETTINGS_FILE" > /tmp/new_settings.gradle
mv /tmp/new_settings.gradle "$SETTINGS_FILE"
echo "pluginManagement added to settings.gradle"
