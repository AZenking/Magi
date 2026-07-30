# Keep Retrofit/OkHttp service interfaces and kotlinx.serialization @Serializable models.
-keep,allowobfuscation,allowshrinking interface com.magi.tv.data.OpenApi
-keep class com.magi.tv.data.model.** { *; }
-keepclassmembers class kotlinx.serialization.json.** { *; }
