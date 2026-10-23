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
    
    original = content
    
    # Remove ReactAndroid reference - multiple patterns
    patterns = [
        r"apply from: new File\(\['\.\./node_modules', 'react-native/ReactAndroid/gradle\.properties'\]\.join\('/'\)\)",
        r"apply from: new File\(\['\.\./node_modules', 'react-native/ReactAndroid', 'gradle\.properties'\]\.join\('/'\)\)",
        r"apply from:.*ReactAndroid.*gradle\.properties",
    ]
    for pattern in patterns:
        content = re.sub(pattern, "// apply from: ReactAndroid/gradle.properties (removed for RN 0.74)", content)
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'
    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Fix kotlin.srcDirs - multiple patterns
    content = re.sub(
        r"kotlin\.srcDirs\s*\+\=\s*file\(['"]src/main/kotlin['"]\)\.absolutePath",
        "def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]
        kotlin.srcDirs = kotlinSrcDirs",
        content
    )
    
    # Add java src dirs if sourceSets exists
    if 'sourceSets' in content and 'java.srcDirs' not in content:
        content = content.replace(
            "kotlin.srcDirs = kotlinSrcDirs",
            "kotlin.srcDirs = kotlinSrcDirs
        def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]
        java.srcDirs = javaSrcDirs"
        )
    
    if content != original:
        with open(path, 'w') as f:
            f.write(content)
        print(f"Fixed {path}")
    else:
        print(f"No changes needed for {path}")

def fix_safe_area_context():
    path = "node_modules/react-native-safe-area-context/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    original = content
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'
    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Fix java.directories
    content = re.sub(
        r"java\.directories\s*\+\=\s*file\(['"]src/main/java['"]\)\.absolutePath",
        "def javaSrcDirs = java.srcDirs + [file('src/main/java').absolutePath]
        java.srcDirs = javaSrcDirs",
        content
    )
    
    # Add kotlin src dirs
    if 'sourceSets' in content and 'kotlin.srcDirs' not in content:
        content = content.replace(
            "java.srcDirs = javaSrcDirs",
            "java.srcDirs = javaSrcDirs
        def kotlinSrcDirs = kotlin.srcDirs + [file('src/main/kotlin').absolutePath]
        kotlin.srcDirs = kotlinSrcDirs"
        )
    
    if content != original:
        with open(path, 'w') as f:
            f.write(content)
        print(f"Fixed {path}")
    else:
        print(f"No changes needed for {path}")

def fix_screens():
    path = "node_modules/react-native-screens/android/build.gradle"
    if not os.path.exists(path):
        print(f"NOT FOUND: {path}")
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    original = content
    
    # Add compileSdkVersion if not present
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'
    compileSdkVersion 34',
            content,
            count=1
        )
    
    # Disable codegen task
    if 'generateCodegenArtifactsFromSchema' not in content:
        content = re.sub(
            r'(defaultConfig\s*\{)',
            r"    tasks.named('generateCodegenArtifactsFromSchema') { enabled = false }

    ",
            content,
            count=1
        )
    
    if content != original:
        with open(path, 'w') as f:
            f.write(content)
        print(f"Fixed {path}")
    else:
        print(f"No changes needed for {path}")

def fix_audio_api():
    # Try multiple possible paths
    paths = [
        "node_modules/react-native-audio-api/android/build.gradle",
        "node_modules/@react-native-community/audio-api/android/build.gradle",
    ]
    
    for path in paths:
        if os.path.exists(path):
            with open(path, 'r') as f:
                content = f.read()
            
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
            return
    
    print("NOT FOUND: react-native-audio-api build.gradle")

def fix_codegen():
    paths = [
        "node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js",
        "node_modules/react-native/node_modules/@react-native/codegen/lib/parsers/typescript/components/componentsUtils.js",
    ]
    
    for path in paths:
        if os.path.exists(path):
            with open(path, 'r') as f:
                content = f.read()
            
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
            return
    
    print("NOT FOUND: codegen componentsUtils.js")

def fix_full_window_overlay():
    paths = [
        "node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.ts",
        "node_modules/react-native-screens/src/fabric/FullWindowOverlayNativeComponent.tsx",
    ]
    
    for path in paths:
        if os.path.exists(path):
            with open(path, 'r') as f:
                content = f.read()
            
            # Remove accessibilityContainerViewIsModal line
            content = re.sub(
                r'  accessibilityContainerViewIsModal\?:\s*boolean;
',
                '',
                content
            )
            
            with open(path, 'w') as f:
                f.write(content)
            print(f"Fixed {path}")
            return
    
    print("NOT FOUND: FullWindowOverlayNativeComponent")

if __name__ == "__main__":
    fix_gesture_handler()
    fix_safe_area_context()
    fix_screens()
    fix_audio_api()
    fix_codegen()
    fix_full_window_overlay()
    print("All fixes applied!")
