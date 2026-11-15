package io.github.arduradiokot.siriuswiki;

import android.os.SystemClock;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "SiriusWikiContent")
public final class WikiContentPlugin extends Plugin {
    private static final long CHECK_INTERVAL = 15 * 60 * 1000;
    private static final long RETRY_INTERVAL = 60 * 1000;
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static long lastAttempt = -RETRY_INTERVAL;

    @PluginMethod
    public void sync(PluginCall call) {
        WikiContent content = WikiContent.get(getContext());
        worker.execute(() -> {
            try {
                long elapsed = System.currentTimeMillis() - content.lastChecked();
                long now = SystemClock.elapsedRealtime();
                boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
                boolean ready = (elapsed < 0 || elapsed >= CHECK_INTERVAL) && now - lastAttempt >= RETRY_INTERVAL;
                boolean updated = false;
                if (force || ready) {
                    lastAttempt = now;
                    updated = content.sync();
                }
                call.resolve(new JSObject().put("updated", updated));
            } catch (Exception error) {
                call.reject("Не удалось обновить материалы.", "SYNC_FAILED");
            }
        });
    }
}
