import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("kotlin-android")
    id("kotlin-parcelize")
    id("kotlin-kapt")
}

android {
    namespace = "com.micshare.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.micshare.app"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // Set the main activity for Jetpack Compose
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            val keystorePath = project.findProperty("android.keystore.path") as String? ?: System.getenv("ANDROID_KEYSTORE_PATH")
            val keystorePassword = project.findProperty("android.keystore.password") as String? ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            val keyAlias = project.findProperty("android.key.alias") as String? ?: System.getenv("ANDROID_KEY_ALIAS")
            val keyPassword = project.findProperty("android.key.password") as String? ?: System.getenv("ANDROID_KEY_PASSWORD")

            if (keystorePath != null && keystorePassword != null && keyAlias != null && keyPassword != null) {
                storeFile = file(keystorePath)
                storePassword = keystorePassword
                this.keyAlias = keyAlias
                this.keyPassword = keyPassword
            } else {
                // For local development without properties, use debug signing
                throw GradleException("Release keystore properties not found. Set android.keystore.path, android.keystore.password, android.key.alias, android.key.password in local.properties or as environment variables.")
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
        freeCompilerArgs += listOf("-Xno-inline")
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.6.0"
    }

    packagingOptions {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.08.00")
    val material3 = "androidx.compose.material3:material3"
    val materialIcons = "androidx.compose.material:material-icons-extended"
    val materialComponents = "com.google.android.material:material:1.12.0"
    val activityCompose = "androidx.activity:activity-compose:1.9.1"
    val viewModelCompose = "androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2"
    val lifecycleRuntimeCompose = "androidx.lifecycle:lifecycle-runtime-compose:2.8.2"
    val coreKtx = "androidx.core:core-ktx:1.13.1"
    val coroutines = "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"
    val okhttp = "com.squareup.okhttp3:okhttp:4.12.0"
    val okio = "com.squareup.okio:okio:3.9.0"
    val room = "androidx.room:room-runtime:2.6.1"
    val roomKtx = "androidx.room:room-ktx:2.6.1"
    val roomCompiler = "androidx.room:room-compiler:2.6.1"
    val datastore = "androidx.datastore:datastore-preferences:1.1.1"
    val permissions = "androidx.activity:activity-ktx:1.9.1"

    implementation(composeBom)
    implementation(material3)
    implementation(materialIcons)
    implementation(materialComponents)
    implementation(activityCompose)
    implementation(viewModelCompose)
    implementation(lifecycleRuntimeCompose)
    implementation(coreKtx)
    implementation(coroutines)
    implementation(okhttp)
    implementation(okio)
    implementation(room)
    implementation(roomKtx)
    kapt(roomCompiler)
    implementation(datastore)
    implementation(permissions)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-text")
    implementation("androidx.compose.ui:ui-text-android")

    // Audio capture for microphone
    implementation("androidx.media3:media3-common:1.4.1")
    implementation("androidx.media3:media3-extractor:1.4.1")

    // Network
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.08.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-tooling-preview")
}