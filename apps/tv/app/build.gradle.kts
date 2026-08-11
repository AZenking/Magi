plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.magi.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.magi.tv"
        // Android TV 9 = API 28. minSdk 23 satisfies Compose for TV libraries.
        minSdk = 23
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"

        // The server URL and public OAuth client id are not secrets. Device
        // credentials are obtained by default-account registration at runtime.
        buildConfigField(
            "String",
            "MAGI_SERVER_URL",
            "\"${project.findProperty("magi.serverUrl") ?: "http://10.0.2.2:3001"}\"",
        )
        buildConfigField(
            "String",
            "MAGI_DEVICE_CLIENT_ID",
            "\"${project.findProperty("magi.deviceClientId") ?: "magi_tv"}\"",
        )

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.activity.compose)

    // Compose (BOM-managed) + Compose for TV
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.tv.foundation)
    implementation(libs.androidx.tv.material)
    // Standard Material3 for text fields (TV material3 intentionally omits input
    // components). Mixed with TV material3 for the focus/surface components.
    implementation("androidx.compose.material3:material3")
    // Coil for remote image loading (channel logos from the open API).
    // Coil 3 splits out network support — coil-network is REQUIRED to load
    // https:// URLs; without it AsyncImage silently fails (no error, no success).
    implementation("io.coil-kt.coil3:coil-compose:3.0.4")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.0.4")
    // Encrypted credential storage backed by Android Keystore (constitution VIII).
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Media3 / ExoPlayer — present on the classpath; full playback wiring lands
    // once real-device HLS/MPEG-TS validation begins.
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.exoplayer.hls)
    implementation(libs.androidx.media3.ui)

    // Networking — MagiClient talks to the Magi open API (/api/open/v1/*)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    androidTestImplementation(kotlin("test"))
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Core library desugaring — enables java.time (Instant/LocalDate/ZoneId) on minSdk 23.
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.3")
}
