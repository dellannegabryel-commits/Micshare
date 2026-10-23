#!/usr/bin/env python3
import os
import re

def fix_gesture_handler():
    path = "node_modules/react-native-gesture-handler/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Remove ReactAndroid reference
    content = content.replace(
        "apply from: new File(['../node_modules', 'react-native/ReactAndroid/gradle.properties'].join('/'))",
        "// apply from: ReactAndroid/gradle.properties (not needed in RN 0.74)"
    )
    content = content.replace(
        "apply from: new File(['../node_modules', 'react-native/ReactAndroid', 'gradle.properties'].join('/'))",
        "// apply from: ReactAndroid/gradle.properties (not needed in RN 0.74)"
    )
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'\1\n    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Fix kotlin.srcDirs
    if 'kotlin.srcDirs +=' in content:
        content = content.replace(
            "kotlin.srcDirs += file('src/main/kotlin').absolutePath",
            "def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]\n        kotlin.srcDirs = kotlinSrcDirs"
        )
    
    # Add java src dirs
    if 'java.srcDirs' not in content and 'sourceSets' in content:
        content = content.replace(
            "kotlin.srcDirs = kotlinSrcDirs",
            "kotlin.srcDirs = kotlinSrcDirs\n        def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]\n        java.srcDirs = javaSrcDirs"
        )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_safe_area_context():
    path = "node_modules/react-native-safe-area-context/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'\1\n    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Fix java.directories
    if 'java.directories +=' in content:
        content = content.replace(
            "java.directories += file('src/main/java').absolutePath",
            "def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]\n        java.srcDirs = javaSrcDirs"
        )
    
    # Add kotlin src dirs
    if 'kotlin.srcDirs' not in content and 'sourceSets' in content:
        content = content.replace(
            "java.srcDirs = javaSrcDirs",
            "java.srcDirs = javaSrcDirs\n        def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]\n        kotlin.srcDirs = kotlinSrcDirs"
        )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_screens():
    path = "node_modules/react-native-screens/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'\1\n    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Disable codegen task
    if 'generateCodegenArtifactsFromSchema' not in content:
        content = re.sub(
            r'(defaultConfig\s*\{)',
            r'    tasks.named(\'generateCodegenArtifactsFromSchema\') { enabled = false }\n\n    \1',
            content,
            count=1
        )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_audio_api():
    path = "node_modules/react-native-audio-api/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Fix minimalReactNativeVersion
    content = content.replace(
        'minimalReactNativeVersion = 76',
        'minimalReactNativeVersion = 74'
    )
    content = content.replace(
        'minimalReactNativeVersion = 75',
        'minimalReactNativeVersion = 74'
    )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_codegen():
    path = "node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Add handling for TSBooleanKeyword, TSStringKeyword, TSNumberKeyword after WithDefault unpacking
    if 'TSBooleanKeyword' not in content:
        content = content.replace(
            '  return typeAnnotation;',
            '''  // Handle TSBooleanKeyword, TSStringKeyword, TSNumberKeyword after WithDefault unpacking
  if (typeAnnotation && typeAnnotation.type) {
    switch (typeAnnotation.type) {
      case 'TSBooleanKeyword':
        return { ...typeAnnotation, type: 'BooleanTypeAnnotation' };
      case 'TSStringKeyword':
        return { ...typeAnnotation, type: 'StringTypeAnnotation' };
      case 'TSNumberKeyword':
        return { ...typeAnnotation, type: 'NumberTypeAnnotation' };
    }
  }
  return typeAnnotation;'''
        )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

def fix_full_window_overlay():
    path = "node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.ts"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    # Remove accessibilityContainerViewIsModal line
    content = re.sub(
        r'  accessibilityContainerViewIsModal\?:\s*boolean;\n',
        '',
        content
    )
    
    with open(path, 'w') as f:
        f.write(content)
    print(f"Fixed {path}")

if __name__ == "__main__":
    fix_gesture_handler()
    fix_safe_area_context()
    fix_screens()
    fix_audio_api()
    fix_codegen()
    fix_full_window_overlay()
    print("All fixes applied!")
