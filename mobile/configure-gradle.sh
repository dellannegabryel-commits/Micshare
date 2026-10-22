#!/bin/bash
# Write complete correct settings.gradle
set -e

SETTINGS_FILE="settings.gradle"
if [ ! -f "$SETTINGS_FILE" ]; then
    echo "settings.gradle not found"
    exit 1
fi

# Write complete new settings.gradle
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

def (_, reactNativeMinor, reactNativePatch) = version.split("-")[0].tokenize('.').collect { it.toInteger() }

includeBuild(new File(["node", "--print", "require.resolve('@react-native/gradle-plugin/package.json')"].execute(null, rootDir).text.trim()).getParentFile().toString())
if(reactNativeMinor == 74 && reactNativePatch <= 3){
  includeBuild("react-settings-plugin")
}

plugins { id("com.facebook.react.settings") }

def getRNMinorVersion() {
  def version = providers.exec {
    commandLine("node", "-e", "console.log(require('react-native/package.json').version);")
  }.standardOutput.asText.get().trim()

  def coreVersion = version.split("-")[0]
  def (major, minor, patch) = coreVersion.tokenize('.').collect { it.toInteger() }

  return minor
}

if (getRNMinorVersion() >= 75) {
  extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
    if (System.getenv('EXPO_UNSTABLE_CORE_AUTOLINKING') == '1') {
      println('[32mUsing expo-modules-autolinking as core autolinking source[0m')
      def command = [
        'node',
        '--no-warnings',
        '--eval',
        'require(require.resolve('expo-modules-autolinking', { paths: [require.resolve('expo/package.json')] }))(process.argv.slice(1))',
        'autolink',
        '--platform',
        'android',
        '--verbose'
      ]
      command += project.gradle.startParameter.commandLineArgs.findAll { it.startsWith('--') }
      def proc = command.execute()
      proc.waitFor()
      def output = proc.in.text
      println(output)
    } else {
      ex.autolink { config ->
        config.expoModules = true
      }
    }
  }
}

include(":expo")
include(":expo-dev-launcher")
include(":expo-modules-core")
include(":react-native-audio-api")
include(":react-native-udp")
include(":react-native-gesture-handler")
include(":react-native-reanimated")
include(":react-native-safe-area-context")
include(":react-native-screens")
include(":expo-audio")

project(":expo").projectDir = new File(rootProject.projectDir, "../node_modules/expo/android")
project(":expo-dev-launcher").projectDir = new File(rootProject.projectDir, "../node_modules/expo-dev-launcher/android")
project(":expo-modules-core").projectDir = new File(rootProject.projectDir, "../node_modules/expo-modules-core/android")
project(":react-native-audio-api").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-audio-api/android")
project(":react-native-udp").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-udp/android")
project(":react-native-gesture-handler").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-gesture-handler/android")
project(":react-native-reanimated").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-reanimated/android")
project(":react-native-safe-area-context").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-safe-area-context/android")
project(":react-native-screens").projectDir = new File(rootProject.projectDir, "../node_modules/react-native-screens/android")
project(":expo-audio").projectDir = new File(rootProject.projectDir, "../node_modules/expo-audio/android")

include(":app")
EOF

echo "settings.gradle written completely"
cat "$SETTINGS_FILE" | head -30
