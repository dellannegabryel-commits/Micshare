import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.micshare"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.micshare"
        minSdk = 23
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            val keystorePath = project.findProperty("android.keystore.path") as String? ?: System.getenv("ANDROID_KEYSTORE_PATH")
            val keystorePassword = project.findProperty("android.keystore.password") as String? ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            val keyAlias = project.findProperty("android.keystore.alias") as String? ?: System.getenv("ANDROID_KEY_ALIAS")
            val keyPassword = project.findProperty("android.keystore.password") as String? ?: System.getenv("ANDROID_KEY_PASSWORD")

            if (keystorePath != null && keystorePassword != null && keyAlias != null && keyPassword != null) {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            } else {
                // Fallback to debug signing for CI builds without keystore
                storeFile = file(System.getProperty("user.home") + "/.android/debug.keystore")
                storePassword = "android"
                this.keyAlias = "androiddebugkey"
                this.keyPassword = "android"
            }
        }
    }

    buildTypes {
        getByName("debug") {
            isDebuggable = true
        }
        getByName("release") {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = "11"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        // Compose Compiler 1.5.14 é o par oficial do Kotlin 1.9.24
        // (1.5.15 exige Kotlin 1.9.25).
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.08.00")
    val material3 = "androidx.compose.material3:material3"
    val materialIcons = "androidx.compose.material:material-icons-extended"
    val activityCompose = "androidx.activity:activity-compose:1.9.1"
    val viewModelCompose = "androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2"
    val lifecycleRuntimeCompose = "androidx.lifecycle:lifecycle-runtime-compose:2.8.2"
    val coreKtx = "androidx.core:core-ktx:1.13.1"
    val coroutines = "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"
    val serialization = "org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3"
    val datastore = "androidx.datastore:datastore-preferences:1.1.1"

    // Ktor: cliente WebSocket do canal de controle (mesmo papel do
    // tokio-tungstenite no servidor Rust).
    val ktor = "2.3.12"

    implementation(composeBom)
    implementation(material3)
    implementation(materialIcons)
    implementation(activityCompose)
    implementation(viewModelCompose)
    implementation(lifecycleRuntimeCompose)
    implementation(coreKtx)
    implementation(coroutines)
    implementation(serialization)
    implementation(datastore)

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-text")
    implementation("androidx.compose.ui:ui-text-android")

    implementation("io.ktor:ktor-client-core:$ktor")
    implementation("io.ktor:ktor-client-cio:$ktor")
    implementation("io.ktor:ktor-client-websockets:$ktor")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.08.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-tooling-preview")
}
