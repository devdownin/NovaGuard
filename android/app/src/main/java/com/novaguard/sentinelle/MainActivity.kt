package com.novaguard.sentinelle

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import com.novaguard.sentinelle.databinding.ActivityMainBinding

/**
 * A shell around the Sentinelle web client.
 *
 * The client is served by the panel itself, so the WebView points straight at
 * it: same origin, no bundled copy that could drift out of step with the
 * panel it talks to. The trade is that there is no UI without the panel — for
 * an alarm display that is the honest behaviour, since a cached screen would
 * show a state nobody can vouch for.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var ui: ActivityMainBinding
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    private var panel: String? = null

    companion object {
        private const val PREFS = "sentinelle"
        private const val KEY_PANEL = "panel_url"

        /** "192.168.1.20:8787" and "https://panel.home" are both accepted. */
        fun normalize(raw: String): String? {
            val trimmed = raw.trim().trimEnd('/')
            if (trimmed.isEmpty()) return null
            val withScheme =
                if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed
                else "http://$trimmed"
            val host = runCatching { Uri.parse(withScheme).host }.getOrNull()
            return if (host.isNullOrBlank()) null else withScheme
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ui = ActivityMainBinding.inflate(layoutInflater)
        setContentView(ui.root)

        ui.web.apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            /* Nothing in the app is loaded from disk, so keep the WebView away
               from the filesystem entirely. */
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = PanelClient()
            addJavascriptInterface(PanelBridge(), "SentinelleHost")
        }

        ui.connect.setOnClickListener {
            val next = normalize(ui.address.text.toString())
            if (next == null) {
                ui.address.error = getString(R.string.setup_hint)
                return@setOnClickListener
            }
            prefs.edit().putString(KEY_PANEL, next).apply()
            panel = next
            load()
        }

        ui.retry.setOnClickListener { load() }
        ui.changeAddress.setOnClickListener { showSetup() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (ui.web.isVisible && ui.web.canGoBack()) ui.web.goBack() else finish()
            }
        })

        panel = prefs.getString(KEY_PANEL, null)
        if (panel == null) showSetup() else load()
    }

    /* --- screens --------------------------------------------------------- */

    private fun showSetup() {
        ui.address.setText(panel ?: "")
        ui.setup.visibility = View.VISIBLE
        ui.error.visibility = View.GONE
        ui.web.visibility = View.GONE
    }

    private fun showError(detail: String) {
        ui.errorDetail.text = detail
        ui.error.visibility = View.VISIBLE
        ui.setup.visibility = View.GONE
        ui.web.visibility = View.GONE
    }

    private fun showWeb() {
        ui.web.visibility = View.VISIBLE
        ui.error.visibility = View.GONE
        ui.setup.visibility = View.GONE
    }

    private fun load() {
        val base = panel ?: return showSetup()
        showWeb()
        /* frame=none tells the client to drop the mock device chrome: Android
           draws the real status bar. */
        ui.web.loadUrl("$base/?frame=none")
    }

    /* --- web view -------------------------------------------------------- */

    private inner class PanelClient : WebViewClient() {

        /** Keep panel navigation in the app; send anything else to a browser. */
        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val target = request.url
            val here = runCatching { Uri.parse(panel).host }.getOrNull()
            if (target.host != null && target.host != here) {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, target)) }
                return true
            }
            return false
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            if (!request.isForMainFrame) return
            showError("${panel ?: ""}\n\n${error.description}")
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            response: WebResourceResponse
        ) {
            if (!request.isForMainFrame) return
            showError("${panel ?: ""}\n\nHTTP ${response.statusCode}")
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (ui.error.visibility != View.VISIBLE) showWeb()
        }
    }

    /**
     * Lets the web client's Settings tab reopen the address form, so the app
     * keeps one settings surface instead of adding native chrome above a UI
     * that already has its own header.
     */
    inner class PanelBridge {
        @JavascriptInterface
        fun changePanel() = runOnUiThread { showSetup() }
    }
}
