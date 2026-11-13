import java.io.FileInputStream
import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val releaseSigningProperties =
    Properties()

val releaseSigningPropertiesFile =
    rootProject.file("key.properties")

if (releaseSigningPropertiesFile.isFile) {
    FileInputStream(
        releaseSigningPropertiesFile,
    ).use { input ->
        releaseSigningProperties.load(input)
    }
}

val requiredReleaseSigningProperties =
    listOf(
        "storePassword",
        "keyPassword",
        "keyAlias",
        "storeFile",
    )

val releaseSigningStorePath =
    releaseSigningProperties
        .getProperty("storeFile")
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

val releaseSigningStoreFile =
    releaseSigningStorePath
        ?.let { path ->
            rootProject.file(path)
        }

fun requireReleaseSigning() {
    if (!releaseSigningPropertiesFile.isFile) {
        throw GradleException(
            "SWIFORA_ANDROID_RELEASE_SIGNING_REQUIRED: " +
                "android/key.properties is required " +
                "for Android release artifacts.",
        )
    }

    val missing =
        requiredReleaseSigningProperties
            .filter { propertyName ->
                releaseSigningProperties
                    .getProperty(propertyName)
                    ?.trim()
                    .isNullOrEmpty()
            }

    if (missing.isNotEmpty()) {
        throw GradleException(
            "SWIFORA_ANDROID_RELEASE_SIGNING_REQUIRED: " +
                "missing required signing properties: " +
                missing.joinToString(", "),
        )
    }

    if (releaseSigningStoreFile?.isFile != true) {
        throw GradleException(
            "SWIFORA_ANDROID_RELEASE_SIGNING_REQUIRED: " +
                "the configured release keystore " +
                "does not exist or is not a file.",
        )
    }
}

android {
    namespace = "com.swifora.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.swifora.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias =
                releaseSigningProperties
                    .getProperty("keyAlias")
                    ?.trim()

            keyPassword =
                releaseSigningProperties
                    .getProperty("keyPassword")

            storeFile =
                releaseSigningStoreFile

            storePassword =
                releaseSigningProperties
                    .getProperty("storePassword")
        }
    }

    buildTypes {
        release {
            signingConfig =
                signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

val protectedReleaseSigningTasks =
    setOf(
        "validateSigningRelease",
        "signReleaseBundle",
        "packageRelease",
        "assembleRelease",
        "bundleRelease",
    )

tasks.configureEach {
    if (name in protectedReleaseSigningTasks) {
        doFirst {
            requireReleaseSigning()
        }
    }
}

flutter {
    source = "../.."
}
