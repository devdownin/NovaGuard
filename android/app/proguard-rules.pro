# The WebView calls into this object by name from JavaScript, so its methods
# must survive shrinking.
-keepclassmembers class com.novaguard.sentinelle.MainActivity$PanelBridge {
    public *;
}
