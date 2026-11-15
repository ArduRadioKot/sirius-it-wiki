package io.github.arduradiokot.siriuswiki;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

public final class AccountLoginActivity extends Activity {
    private WebView loginPage;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.WHITE);
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(layout, (view, insets) -> {
            androidx.core.graphics.Insets safe = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                | androidx.core.view.WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });
        Button back = new Button(this);
        back.setText(R.string.account_login_back);
        back.setOnClickListener(view -> finish());
        layout.addView(back);
        loginPage = new WebView(this);
        layout.addView(loginPage, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);

        loginPage.getSettings().setJavaScriptEnabled(true);
        loginPage.getSettings().setDomStorageEnabled(true);
        loginPage.getSettings().setAllowFileAccess(false);
        loginPage.getSettings().setAllowContentAccess(false);
        loginPage.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(loginPage, false);
        loginPage.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !AccountPlugin.isAccountUri(request.getUrl());
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (!AccountPlugin.isAccountUri(uri) || !AccountPlugin.isAccountPage(uri.getPath())) return;
                cookies.flush();
                setResult(RESULT_OK);
                finish();
            }
        });
        loginPage.loadUrl(AccountPlugin.ORIGIN + "/dashboard");
    }

    @Override
    protected void onDestroy() {
        if (loginPage != null) {
            loginPage.stopLoading();
            ((LinearLayout) loginPage.getParent()).removeView(loginPage);
            loginPage.destroy();
        }
        super.onDestroy();
    }
}
