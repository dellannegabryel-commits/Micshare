import re, os

# Fix root build.gradle
path = "android/build.gradle"
if os.path.exists(path):
    with open(path, 'r') as f:
        content = f.read()
    if 'REACT_NATIVE_NODE_MODULES_DIR' not in content:
        content = re.sub(r'(plugins\s*\{[^}]+\})', r'

ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")
ext.compileSdkVersion = 34
', content, count=1)
        with open(path, 'w') as f:
            f.write(content)
        print('Fixed root build.gradle')

# Fix app/build.gradle
path = "android/app/build.gradle"
if os.path.exists(path):
    with open(path, 'r') as f:
        content = f.read()
    if 'REACT_NATIVE_NODE_MODULES_DIR' not in content:
        content = re.sub(r'(plugins\s*\{[^}]+\})', r'

ext.REACT_NATIVE_NODE_MODULES_DIR = new File(rootProject.projectDir, "../node_modules")
ext.compileSdkVersion = 34
', content, count=1)
    if 'compileSdkVersion' not in content:
        content = re.sub(r'(android\s*\{)', r'
    compileSdkVersion 34', content, count=1)
    if 'namespace' not in content:
        content = re.sub(r'(android\s*\{)', r'
    namespace "com.micshare"', content, count=1)
    with open(path, 'w') as f:
        f.write(content)
    print('Fixed app/build.gradle')

# Fix AndroidManifest.xml
path = "android/app/src/main/AndroidManifest.xml"
if os.path.exists(path):
    with open(path, 'r') as f:
        content = f.read()
    if 'usesCleartextTraffic' not in content:
        content = content.replace('<application ', '<application android:usesCleartextTraffic="true" ')
        with open(path, 'w') as f:
            f.write(content)
        print('Fixed AndroidManifest.xml')
print('All fixes applied!')
