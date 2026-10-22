#!/bin/bash
# Apply all RN 0.74 compatibility patches
# Run this after npm ci in the mobile directory

set -e

echo "Applying RN 0.74 compatibility patches..."

# 1. Patch @react-native/codegen componentsUtils.js (root)
echo "Patching @react-native/codegen..."
cat > /tmp/codegen.patch << 'EOF'
--- a/lib/parsers/typescript/components/componentsUtils.js
+++ b/lib/parsers/typescript/components/componentsUtils.js
@@ -397,7 +397,13 @@
       };
     case 'TSNumberKeyword':
       throw new Error(
-        `Cannot use "${type}" type annotation for "${name}": must use a specific numeric type like Int32, Double, or Float`,
+        // Handle primitive keyword types (from parseTopLevelType after unpacking WithDefault)
+        case 'TSBooleanKeyword':
+          return { type: 'ReservedPropTypeAnnotation', name: 'Boolean' };
+        case 'TSStringKeyword':
+          return { type: 'ReservedPropTypeAnnotation', name: 'String' };
+        case 'TSNumberKeyword':
+          // Could be Int32, Float, Double - default to Float for JS numbers
+          return { type: 'ReservedPropTypeAnnotation', name: 'Float' };
+        case 'TSFunctionType':
         `Cannot use "${type}" type annotation for "${name}": must use a specific function type like BubblingEventHandler, or DirectEventHandler`,
       );
     default:
EOF

patch -p1 -d node_modules/@react-native/codegen < /tmp/codegen.patch || true

# 2. Patch nested codegen in react-native
cat > /tmp/nested-codegen.patch << 'EOF'
--- a/lib/parsers/typescript/components/componentsUtils.js
+++ b/lib/parsers/typescript/components/componentsUtils.js
@@ -397,7 +397,13 @@
       };
     case 'TSNumberKeyword':
       throw new Error(
-        `Cannot use "${type}" type annotation for "${name}": must use a specific numeric type like Int32, Double, or Float`,
+        // Handle primitive keyword types (from parseTopLevelType after unpacking WithDefault)
+        case 'TSBooleanKeyword':
+          return { type: 'ReservedPropTypeAnnotation', name: 'Boolean' };
+        case 'TSStringKeyword':
+          return { type: 'ReservedPropTypeAnnotation', name: 'String' };
+        case 'TSNumberKeyword':
+          // Could be Int32, Float, Double - default to Float for JS numbers
+          return { type: 'ReservedPropTypeAnnotation', name: 'Float' };
+        case 'TSFunctionType':
         `Cannot use "${type}" type annotation for "${name}": must use a specific function type like BubblingEventHandler, or DirectEventHandler`,
       );
     default:
EOF

patch -p1 -d node_modules/react-native/node_modules/@react-native/codegen < /tmp/nested-codegen.patch || true

# 3. Patch react-native-gesture-handler build.gradle
cat > /tmp/rngh.patch << 'EOF'
--- a/android/build.gradle
+++ b/android/build.gradle
@@ -209,7 +209,7 @@
         }
 
     sourceSets.main {
         kotlin {
-            if (shouldUseCommonInterfaceFromReanimated()) {
+            def srcDirs = []
+            if (shouldUseCommonInterfaceFromReanimated()) {
                 directories.add('reanimated/src/main/java')
             } else {
                 directories.add('noreanimated/src/main/java')
@@ -219,13 +219,17 @@
             if (shouldUseCommonInterfaceFromRNSVG()) {
                 directories.add('svg/src/main/java')
             } else {
                 directories.add('nosvg/src/main/java')
             }
         }
     }
+    }
+    if (!srcDirs.isEmpty()) {
+        kotlin.srcDirs = srcDirs
+    }
 }
EOF

patch -p1 -d node_modules/react-native-gesture-handler < /tmp/rngh.patch || true

# 4. Patch react-native-safe-area-context build.gradle
cat > /tmp/rnsac.patch << 'EOF'
--- a/android/build.gradle
+++ b/android/build.gradle
@@ -100,7 +100,7 @@
     sourceSets.main {
         if (isNewArchitectureEnabled()) {
             java.directories.add("${project.buildDir}/generated/source/codegen/java") // contains only java files
             kotlin.directories.add("src/fabric/java") // contains only kotlin files
         } else {
             java.directories.add("src/paper/java") // contains both java and kotlin files
             kotlin.directories.add("src/paper/java")
         }
     }
 }
EOF

patch -p1 -d node_modules/react-native-safe-area-context < /tmp/rnsac.patch || true

# 5. Patch react-native-screens FullWindowOverlay.tsx
cat > /tmp/rns-overlay.patch << 'EOF'
--- a/src/components/FullWindowOverlay.tsx
+++ b/src/components/FullWindowOverlay.tsx
@@ -22,7 +22,7 @@ function FullWindowOverlay(props: FullWindowOverlayProps) {
   if (Platform.OS !== 'ios') {
     console.warn('Using FullWindowOverlay is only valid on iOS devices.');
     return <View {...props} />;
   }
-  return (
+  // Conditionally pass accessibilityContainerViewIsModal only on iOS where supported
+  const nativeProps = {
+    style: [StyleSheet.absoluteFill, { width, height }],
+  };
+  if (Platform.OS === 'ios') {
+    nativeProps.accessibilityContainerViewIsModal = props.unstable_accessibilityContainerViewIsModal;
+  }
+  return (
     <NativeFullWindowOverlay
-      style={[StyleSheet.absoluteFill, { width, height }]}
-      accessibilityContainerViewIsModal={
-        props.unstable_accessibilityContainerViewIsModal
-      }>
-      {props.children}
-    </NativeFullWindowOverlay>
+    {...nativeProps}>
+      {props.children}
+    </NativeFullWindowOverlay>
   );
 }
EOF

patch -p1 -d node_modules/react-native-screens < /tmp/rns-overlay.patch || true

# 6. Patch react-native-screens FullWindowOverlayNativeComponent.ts
cat > /tmp/rns-native.patch << 'EOF'
--- a/src/fabric/FullWindowOverlayNativeComponent.ts
+++ b/src/fabric/FullWindowOverlayNativeComponent.ts
@@ -8,7 +8,7 @@
 
 // Internal export, not part of stable library API.
 export interface NativeProps extends ViewProps {
-  // Compatibility with RN 0.74 codegen - use simple boolean instead of CT.WithDefault
-  accessibilityContainerViewIsModal?: boolean;
+  // accessibilityContainerViewIsModal is iOS-only and not supported in RN 0.74 codegen
+  // accessibilityContainerViewIsModal?: boolean;
 }
 
 export default codegenNativeComponent<NativeProps>('RNSFullWindowOverlay', {
EOF

patch -p1 -d node_modules/react-native-screens < /tmp/rns-native.patch || true

# 6b. Patch compiled .d.ts
cat > /tmp/rns-dts.patch << 'EOF'
--- a/lib/typescript/fabric/FullWindowOverlayNativeComponent.d.ts
+++ b/lib/typescript/fabric/FullWindowOverlayNativeComponent.d.ts
@@ -1,7 +1,7 @@
 import type { CodegenTypes as CT, HostComponent, ViewProps } from 'react-native';
 export interface NativeProps extends ViewProps {
-    accessibilityContainerViewIsModal?: CT.WithDefault<boolean, true>;
+    // accessibilityContainerViewIsModal is iOS-only and not supported in RN 0.74 codegen
+    // accessibilityContainerViewIsModal?: CT.WithDefault<boolean, true>;
 }
 declare const _default: HostComponent<NativeProps>;
 export default _default;
EOF

patch -p1 -d node_modules/react-native-screens < /tmp/rns-dts.patch || true

# 7. Patch react-native-screens build.gradle to disable codegen
cat > /tmp/rns-gradle.patch << 'EOF'
--- a/android/build.gradle
+++ b/android/build.gradle
@@ -9999,3 +9999,12 @@
 // Disable codegen for RN 0.74 compatibility
 tasks.named('generateCodegenSchemaFromJavaScript') {
     enabled = false
 }
 tasks.named('generateCodegenArtifactsFromSchema') {
     enabled = false
 }
EOF

patch -p1 -d node_modules/react-native-screens < /tmp/rns-gradle.patch || true

# 8. Patch react-native-audio-api build.gradle (lower min RN version)
cat > /tmp/rnaudio.patch << 'EOF'
--- a/android/build.gradle
+++ b/android/build.gradle
@@ -313,7 +313,7 @@
 def assertMinimalReactNativeVersion = task assertMinimalReactNativeVersionTask {
     // If you change the minimal React Native version remember to update Compatibility Table in docs
-    def minimalReactNativeVersion = 76
+    def minimalReactNativeVersion = 74
     onlyIf { REACT_NATIVE_MINOR_VERSION < minimalReactNativeVersion }
     doFirst {
         throw new GradleException("[AudioAPI] Unsupported React Native version. Please use $minimalReactNativeVersion. or newer.")
EOF

patch -p1 -d node_modules/react-native-audio-api < /tmp/rnaudio.patch || true

echo "All patches applied!"
