package io.github.arduradiokot.siriuswiki;

import android.app.Activity;
import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.CookieManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(name = "SiriusAccount")
public final class AccountPlugin extends Plugin {
    static final String ORIGIN = "https://lks.siriusuniversity.ru";
    private static final int MAX_PAGE_SIZE = 8 * 1024 * 1024;
    private static final Map<String, String> PAGES = new LinkedHashMap<>();
    static {
        PAGES.put("journal", "/journal/list");
        PAGES.put("trajectory", "/student/trajectory");
        PAGES.put("dashboard", "/dashboard");
    }
    private final ExecutorService accountWork = Executors.newSingleThreadExecutor();
    private final ExecutorService cacheWork = Executors.newSingleThreadExecutor();
    private final ExecutorService scheduleWork = Executors.newSingleThreadExecutor();


    static boolean isAccountUri(Uri uri) {
        return "https".equals(uri.getScheme()) && "lks.siriusuniversity.ru".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    static boolean isAccountPage(String path) {
        if (path == null) return false;
        return PAGES.containsValue(path) || path.startsWith("/dashboard/");
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        startActivityForResult(call, new Intent(getContext(), AccountLoginActivity.class), "loginFinished");
    }

    @ActivityCallback
    private void loginFinished(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Вход отменён.", "CANCELLED");
            return;
        }
        refresh(call);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        accountWork.execute(() -> {
            try {
                JSObject pages = new JSObject();
                for (Map.Entry<String, String> page : PAGES.entrySet()) {
                    try {
                        pages.put(page.getKey(), read(ORIGIN + page.getValue(), true, MAX_PAGE_SIZE));
                    } catch (IOException error) {
                        if ("journal".equals(page.getKey())) throw error;
                    }
                }
                JSObject result = new JSObject();
                result.put("pages", pages);
                call.resolve(result);
            } catch (LoginRequired error) {
                call.reject("Войдите в ЛК Сириуса, чтобы обновить данные.", "LOGIN_REQUIRED");
            } catch (Exception error) {
                call.reject("Не удалось загрузить данные ЛК Сириуса.", "NETWORK");
            }
        });
    }

    @PluginMethod
    public void personalSchedule(PluginCall call) {
        String from = call.getString("from", ""), to = call.getString("to", "");
        if (!from.matches("\\d{4}-\\d{2}-\\d{2}") || !to.matches("\\d{4}-\\d{2}-\\d{2}") || from.compareTo(to) > 0) {
            call.reject("Неверная неделя.", "DATE");
            return;
        }
        String address = Uri.parse(ORIGIN + "/schedule/export/students").buildUpon()
            .appendQueryParameter("from", from).appendQueryParameter("to", to)
            .appendQueryParameter("lectures", "0").appendQueryParameter("seminars", "0")
            .appendQueryParameter("practices", "0").appendQueryParameter("laboratories", "0")
            .appendQueryParameter("exams", "0").appendQueryParameter("other", "0").build().toString();
        accountWork.execute(() -> {
            try { call.resolve(new JSObject().put("calendar", read(address, true, 2 * 1024 * 1024))); }
            catch (LoginRequired error) { call.reject("Войдите в ЛК Сириуса.", "LOGIN_REQUIRED"); }
            catch (Exception error) { call.reject("Личное расписание недоступно.", "NETWORK"); }
        });
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        scheduleWork.execute(() -> {
            try {
                JSObject data = new JSObject(read(WidgetSchedule.URL, false, 2 * 1024 * 1024));
                WidgetSchedule.save(getContext(), data);
                ScheduleWidget.redraw(getContext());
                call.resolve(data);
            } catch (Exception error) {
                call.reject("Не удалось обновить расписание.", "NETWORK");
            }
        });
    }

    @PluginMethod
    public void cachedSchedule(PluginCall call) {
        scheduleWork.execute(() -> {
            try { call.resolve(new JSObject(WidgetSchedule.current(getContext()).toString())); }
            catch (Exception error) { call.reject("Расписание недоступно.", "CACHE"); }
        });
    }

    @PluginMethod
    public void cacheSchedule(PluginCall call) {
        scheduleWork.execute(() -> {
            String value = call.getString("value", "");
            if (value.isEmpty() || value.getBytes(StandardCharsets.UTF_8).length > 2 * 1024 * 1024) {
                call.reject("Некорректное расписание.", "CACHE");
                return;
            }
            try {
                WidgetSchedule.save(getContext(), new JSObject(value));
                ScheduleWidget.redraw(getContext());
                call.resolve();
            } catch (Exception error) { call.reject("Не удалось сохранить расписание.", "CACHE"); }
        });
    }

    @PluginMethod
    public void setScheduleGroup(PluginCall call) {
        if (WidgetSchedule.select(getContext(), call.getString("group"))) ScheduleWidget.redraw(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getWidgetTimerSettings(PluginCall call) {
        AlarmManager alarms = getContext().getSystemService(AlarmManager.class);
        call.resolve(new JSObject().put("exact", ScheduleWidget.exactTimersAllowed(alarms)));
    }

    @PluginMethod
    public void openWidgetTimerSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Uri app = Uri.fromParts("package", getContext().getPackageName(), null);
                getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, app));
            } catch (ActivityNotFoundException | SecurityException error) {
                call.reject("Не удалось открыть настройки точного отсчёта.");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void widgetRoute(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        call.resolve(new JSObject().put("route", MainActivity.widgetRoute(activity.getIntent())));
    }

    @PluginMethod
    public void loadCache(PluginCall call) {
        cacheWork.execute(() -> {
            try {
                String value = new AccountCache(getContext()).read();
                JSObject result = new JSObject();
                if (value != null) result.put("value", value);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Не удалось прочитать сохранённые данные.", "CACHE");
            }
        });
    }

    @PluginMethod
    public void saveCache(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > MAX_PAGE_SIZE) {
            call.reject("Данные ЛК не удалось сохранить.", "CACHE");
            return;
        }
        cacheWork.execute(() -> {
            try {
                AccountCache cache = new AccountCache(getContext());
                if (value.isEmpty()) cache.clear();
                else cache.write(value);
                call.resolve();
            } catch (Exception error) {
                call.reject("Не удалось сохранить данные ЛК.", "CACHE");
            }
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        cacheWork.execute(() -> {
            new AccountCache(getContext()).clear();
            getActivity().runOnUiThread(() -> CookieManager.getInstance().removeAllCookies(removed -> {
                CookieManager.getInstance().flush();
                call.resolve();
            }));
        });
    }

    static String read(String address, boolean account, int limit) throws Exception {
        HttpURLConnection request = (HttpURLConnection) new URL(address).openConnection();
        try {
            request.setInstanceFollowRedirects(false);
            request.setUseCaches(false);
            request.setConnectTimeout(8000);
            request.setReadTimeout(12000);
            if (account) {
                String cookies = CookieManager.getInstance().getCookie(address);
                if (cookies == null || cookies.isEmpty()) throw new LoginRequired();
                request.setRequestProperty("Cookie", cookies);
            }
            int status = request.getResponseCode();
            if (account && (status == 401 || status == 403 || (status >= 300 && status < 400))) throw new LoginRequired();
            if (status != 200) throw new IOException("HTTP " + status);
            if (account) {
                for (Map.Entry<String, java.util.List<String>> header : request.getHeaderFields().entrySet()) {
                    if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                        for (String cookie : header.getValue()) CookieManager.getInstance().setCookie(address, cookie);
                    }
                }
                CookieManager.getInstance().flush();
            }
            try (InputStream input = request.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > limit) throw new IOException("Response too large");
                    output.write(buffer, 0, count);
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally {
            request.disconnect();
        }
    }

    private static final class LoginRequired extends Exception {}
}
