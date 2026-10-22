#!/usr/bin/env python3
import re
import sys
import os

def fix_root_build_gradle():
    path = "android/build.gradle"
    if not os.path.exists(path):
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    if 'REACT_NATIVE_NODE_MODULES_DIR' in content:
        return
    
    content = re.sub(
        r'(plugins\s*\{[^}]+\})',
        r'

ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")
ext.compileSdkVersion = 34
',
        content,
        count=1
    )
    
    with open(path, 'w') as f:
        f.write(content)
    print("Fixed root build.gradle")

def fix_app_build_gradle():
    path = "android/app/build.gradle"
    if not os.path.exists(path):
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
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
    
    if 'compileSdkVersion' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'
    compileSdkVersion 34',
            content,
            count=1
        )
    
    if 'namespace' not in content:
        content = re.sub(
            r'(android\s*\{)',
            r'
    namespace "com.micshare"',
            content,
            count=1
        )
    
    with open(path, 'w') as f:
        f.write(content)
    print("Fixed app/build.gradle")

def fix_android_manifest():
    path = "android/app/src/main/AndroidManifest.xml"
    if not os.path.exists(path):
        return
    
    with open(path, 'r') as f:
        content = f.read()
    
    if 'usesCleartextTraffic' not in content:
        content = content.replace('<application ', '<application android:usesCleartextTraffic="true" ')
        with open(path, 'w') as f:
            f.write(content)
        print("Fixed AndroidManifest.xml")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    fix_root_build_gradle()
    fix_app_build_gradle()
    fix_android_manifest()
    print("Android patches applied successfully!")
