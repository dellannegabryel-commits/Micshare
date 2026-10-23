#!/bin/bash
set -e

echo "Applying React Native 0.74 fixes..."

# Fix react-native-gesture-handler
GH_PATH="node_modules/react-native-gesture-handler/android/build.gradle"
if [ -f "$GH_PATH" ]; then
  echo "Processing $GH_PATH..."
  
  # Remove ReactAndroid reference - multiple broad patterns
  sed -i '/ReactAndroid\/gradle\.properties/d' "$GH_PATH"
  sed -i '/apply from.*ReactAndroid/d' "$GH_PATH"
  sed -i '/apply from.*gradle\.properties/d' "$GH_PATH"
  
  # Add compileSdkVersion if not present in android block
  if ! grep -A 20 '^android {' "$GH_PATH" | grep -q "compileSdkVersion"; then
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
  echo "Processing $SAC_PATH..."
  
  # Add compileSdkVersion if not present in android block
  if ! grep -A 20 '^android {' "$SAC_PATH" | grep -q "compileSdkVersion"; then
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
  echo "Processing $SCREENS_PATH..."
  
  # Add compileSdkVersion if not present in android block
  if ! grep -A 20 '^android {' "$SCREENS_PATH" | grep -q "compileSdkVersion"; then
    sed -i '/^android {/a\    compileSdkVersion 34' "$SCREENS_PATH"
  fi
  
  # Disable codegen task
  if ! grep -q "generateCodegenArtifactsFromSchema" "$SCREENS_PATH"; then
    sed -i "/^defaultConfig {/i\    tasks.named('generateCodegenArtifactsFromSchema') { enabled = false }\n" "$SCREENS_PATH"
  fi
  
  echo "Fixed $SCREENS_PATH"
fi

# Fix react-native-audio-api (try multiple paths)
AUDIO_PATH1="node_modules/react-native-audio-api/android/build.gradle"
if [ -f "$AUDIO_PATH1" ]; then
  sed -i "s|minimalReactNativeVersion = 76|minimalReactNativeVersion = 74|g" "$AUDIO_PATH1"
  sed -i "s|minimalReactNativeVersion = 75|minimalReactNativeVersion = 74|g" "$AUDIO_PATH1"
  echo "Fixed $AUDIO_PATH1"
fi

AUDIO_PATH2="node_modules/@react-native-community/audio-api/android/build.gradle"
if [ -f "$AUDIO_PATH2" ]; then
  sed -i "s|minimalReactNativeVersion = 76|minimalReactNativeVersion = 74|g" "$AUDIO_PATH2"
  sed -i "s|minimalReactNativeVersion = 75|minimalReactNativeVersion = 74|g" "$AUDIO_PATH2"
  echo "Fixed $AUDIO_PATH2"
fi

# Fix @react-native/codegen (try multiple paths)
CODEGEN_PATH1="node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js"
if [ -f "$CODEGEN_PATH1" ]; then
  if ! grep -q "TSBooleanKeyword" "$CODEGEN_PATH1"; then
    sed -i "/return typeAnnotation;/i\  // Handle TSBooleanKeyword, TSStringKeyword, TSNumberKeyword after WithDefault unpacking\n  if (typeAnnotation && typeAnnotation.type) {\n    switch (typeAnnotation.type) {\n      case 'TSBooleanKeyword':\n        return { ...typeAnnotation, type: 'BooleanTypeAnnotation' };\n      case 'TSStringKeyword':\n        return { ...typeAnnotation, type: 'StringTypeAnnotation' };\n      case 'TSNumberKeyword':\n        return { ...typeAnnotation, type: 'NumberTypeAnnotation' };\n    }\n  }" "$CODEGEN_PATH1"
    echo "Fixed $CODEGEN_PATH1"
  fi
fi

CODEGEN_PATH2="node_modules/react-native/node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js"
if [ -f "$CODEGEN_PATH2" ]; then
  if ! grep -q "TSBooleanKeyword" "$CODEGEN_PATH2"; then
    sed -i "/return typeAnnotation;/i\  // Handle TSBooleanKeyword, TSStringKeyword, TSNumberKeyword after WithDefault unpacking\n  if (typeAnnotation && typeAnnotation.type) {\n    switch (typeAnnotation.type) {\n      case 'TSBooleanKeyword':\n        return { ...typeAnnotation, type: 'BooleanTypeAnnotation' };\n      case 'TSStringKeyword':\n        return { ...typeAnnotation, type: 'StringTypeAnnotation' };\n      case 'TSNumberKeyword':\n        return { ...typeAnnotation, type: 'NumberTypeAnnotation' };\n    }\n  }" "$CODEGEN_PATH2"
    echo "Fixed $CODEGEN_PATH2"
  fi
fi

# Fix FullWindowOverlay (try .ts and .tsx)
FWO_PATH1="node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.ts"
if [ -f "$FWO_PATH1" ]; then
  sed -i "/accessibilityContainerViewIsModal?: boolean;/d" "$FWO_PATH1"
  echo "Fixed $FWO_PATH1"
fi

FWO_PATH2="node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.tsx"
if [ -f "$FWO_PATH2" ]; then
  sed -i "/accessibilityContainerViewIsModal?: boolean;/d" "$FWO_PATH2"
  echo "Fixed $FWO_PATH2"
fi

echo "All fixes applied!"
