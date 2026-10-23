#!/bin/bash
set -e

echo "Applying React Native 0.74 fixes..."

# Fix react-native-gesture-handler
GH_PATH="node_modules/react-native-gesture-handler/android/build.gradle"
if [ -f "$GH_PATH" ]; then
  # Remove ReactAndroid reference
  sed -i "s|apply from: new File(\[.*ReactAndroid.*gradle\.properties.*\])|// apply from: ReactAndroid/gradle.properties (removed for RN 0.74)|g" "$GH_PATH"
  sed -i "s|apply from: new File(\[.*react-native/ReactAndroid.*gradle\.properties.*\])|// apply from: ReactAndroid/gradle.properties (removed for RN 0.74)|g" "$GH_PATH"
  
  # Add compileSdkVersion if not present
  if ! grep -q "compileSdkVersion" "$GH_PATH"; then
    sed -i '/^android {/a\    compileSdkVersion 34' "$GH_PATH"
  fi
  
  # Fix kotlin.srcDirs
  sed -i "s|kotlin.srcDirs += file('src/main/kotlin').absolutePath|def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]\n        kotlin.srcDirs = kotlinSrcDirs|g" "$GH_PATH"
  
  # Add java src dirs
  if grep -q "sourceSets" "$GH_PATH" && ! grep -q "java.srcDirs" "$GH_PATH"; then
    sed -i "s|kotlin.srcDirs = kotlinSrcDirs|kotlin.srcDirs = kotlinSrcDirs\n        def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]\n        java.srcDirs = javaSrcDirs|g" "$GH_PATH"
  fi
  
  echo "Fixed $GH_PATH"
fi

# Fix react-native-safe-area-context
SAC_PATH="node_modules/react-native-safe-area-context/android/build.gradle"
if [ -f "$SAC_PATH" ]; then
  # Add compileSdkVersion if not present
  if ! grep -q "compileSdkVersion" "$SAC_PATH"; then
    sed -i '/^android {/a\    compileSdkVersion 34' "$SAC_PATH"
  fi
  
  # Fix java.directories
  sed -i "s|java.directories += file('src/main/java').absolutePath|def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]\n        java.srcDirs = javaSrcDirs|g" "$SAC_PATH"
  
  # Add kotlin src dirs
  if grep -q "sourceSets" "$SAC_PATH" && ! grep -q "kotlin.srcDirs" "$SAC_PATH"; then
    sed -i "s|java.srcDirs = javaSrcDirs|java.srcDirs = javaSrcDirs\n        def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]\n        kotlin.srcDirs = kotlinSrcDirs|g" "$SAC_PATH"
  fi
  
  echo "Fixed $SAC_PATH"
fi

# Fix react-native-screens
SCREENS_PATH="node_modules/react-native-screens/android/build.gradle"
if [ -f "$SCREENS_PATH" ]; then
  # Add compileSdkVersion if not present
  if ! grep -q "compileSdkVersion" "$SCREENS_PATH"; then
    sed -i '/^android {/a\    compileSdkVersion 34' "$SCREENS_PATH"
  fi
  
  # Disable codegen task
  if ! grep -q "generateCodegenArtifactsFromSchema" "$SCREENS_PATH"; then
    sed -i "/^defaultConfig {/i\    tasks.named('generateCodegenArtifactsFromSchema') { enabled = false }\n" "$SCREENS_PATH"
  fi
  
  echo "Fixed $SCREENS_PATH"
fi

# Fix react-native-audio-api (try multiple paths)
AUDIO_PATHS=("node_modules/react-native-audio-api/android/build.gradle" "node_modules/@react-native-community/audio-api/android/build.gradle")
for AUDIO_PATH in "${AUDIO_PATHS[@]}"; do
  if [ -f "$AUDIO_PATH" ]; then
    sed -i "s|minimalReactNativeVersion = 76|minimalReactNativeVersion = 74|g" "$AUDIO_PATH"
    sed -i "s|minimalReactNativeVersion = 75|minimalReactNativeVersion = 74|g" "$AUDIO_PATH"
    echo "Fixed $AUDIO_PATH"
  fi
done

# Fix @react-native/codegen (try multiple paths)
CODEGEN_PATHS=("node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js" "node_modules/react-native/node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js")
for CODEGEN_PATH in "${CODEGEN_PATHS[@]}"; do
  if [ -f "$CODEGEN_PATH" ]; then
    if ! grep -q "TSBooleanKeyword" "$CODEGEN_PATH"; then
      sed -i "/return typeAnnotation;/i\  // Handle TSBooleanKeyword, TSStringKeyword, TSNumberKeyword after WithDefault unpacking\n  if (typeAnnotation && typeAnnotation.type) {\n    switch (typeAnnotation.type) {\n      case 'TSBooleanKeyword':\n        return { ...typeAnnotation, type: 'BooleanTypeAnnotation' };\n      case 'TSStringKeyword':\n        return { ...typeAnnotation, type: 'StringTypeAnnotation' };\n      case 'TSNumberKeyword':\n        return { ...typeAnnotation, type: 'NumberTypeAnnotation' };\n    }\n  }" "$CODEGEN_PATH"
    echo "Fixed $CODEGEN_PATH"
  fi
done

# Fix FullWindowOverlay (try .ts and .tsx)
FWO_PATHS=("node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.ts" "node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.tsx")
for FWO_PATH in "${FWO_PATHS[@]}"; do
  if [ -f "$FWO_PATH" ]; then
    sed -i "/accessibilityContainerViewIsModal?: boolean;/d" "$FWO_PATH"
    echo "Fixed $FWO_PATH"
  fi
done

echo "All fixes applied!"
