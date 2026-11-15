package io.github.arduradiokot.siriuswiki;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(AccountPlugin.class);
        registerPlugin(WikiContentPlugin.class);
        super.onCreate(state);
    }

    @Override
    protected void load() {
        super.load();
        WikiContent library = WikiContent.get(this);
        Uri origin = Uri.parse(bridge.getLocalUrl());
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if ("GET".equals(request.getMethod()) && origin.getScheme().equals(url.getScheme())
                    && origin.getAuthority().equals(url.getAuthority()) && path != null && path.startsWith("/")) {
                    WebResourceResponse installed = library.open(path.substring(1));
                    if (installed != null) return installed;
                }
                return super.shouldInterceptRequest(view, request);
            }
        });
    }
}
