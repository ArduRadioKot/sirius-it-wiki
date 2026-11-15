package io.github.arduradiokot.siriuswiki;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

final class WidgetSchedule {
    static final String URL = "https://arduradiokot.github.io/sirius-it-wiki/data/schedule.json";
    private static final TimeZone MOSCOW = TimeZone.getTimeZone("Europe/Moscow");
    private static final String DEFAULT_GROUP = "ИОП-ИТ-26/1";

    static String group(Context context) {
        return context.getSharedPreferences("schedule-widget", 0).getString("group", DEFAULT_GROUP);
    }

    static boolean select(Context context, String group) {
        if (group == null || !group.matches("ИОП-ИТ-2[456]/[12]") || group.equals(group(context))) return false;
        context.getSharedPreferences("schedule-widget", 0).edit().putString("group", group).apply();
        return true;
    }

    private static AtomicFile cache(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "widget-schedule.json"));
    }

    private static JSONObject local(Context context) {
        try (InputStream input = context.getAssets().open("public/data/schedule.json")) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int count; (count = input.read(buffer)) != -1;) bytes.write(buffer, 0, count);
            return new JSONObject(bytes.toString("UTF-8"));
        } catch (Exception error) { return new JSONObject(); }
    }

    private static synchronized JSONObject load(Context context) {
        try {
            return new JSONObject(new String(cache(context).readFully(), StandardCharsets.UTF_8));
        } catch (Exception error) { return local(context); }
    }

    static synchronized void save(Context context, JSONObject data) {
        JSONObject groups = data.optJSONObject("groups");
        if (data.optInt("version") != 1 || groups == null || groups.length() == 0) return;
        long time = updated(data);
        JSONObject existing = load(context);
        if (time <= 0 || time < updated(existing)) return;
        JSONObject previousGroups = existing.optJSONObject("groups");
        if (previousGroups != null) {
            for (var keys = previousGroups.keys(); keys.hasNext();) {
                if (groups.optJSONArray(keys.next()) == null) return;
            }
        }
        AtomicFile cache = cache(context);
        FileOutputStream out = null;
        try {
            out = cache.startWrite();
            out.write(data.toString().getBytes(StandardCharsets.UTF_8));
            cache.finishWrite(out);
        } catch (Exception error) {
            if (out != null) cache.failWrite(out);
        }
    }

    private static long updated(JSONObject data) {
        return parse(data.optString("updatedAt").replaceFirst("\\.\\d+(?=[+-]|Z)", ""), "yyyy-MM-dd'T'HH:mm:ssXXX");
    }

    static String day(long time) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(MOSCOW);
        return format.format(new Date(time));
    }

    static String dayLabel(String iso) {
        SimpleDateFormat format = new SimpleDateFormat("d MMMM", Locale.forLanguageTag("ru"));
        format.setTimeZone(MOSCOW);
        return format.format(new Date(parse(iso, "yyyy-MM-dd")));
    }

    private static long parse(String value, String pattern) {
        SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.ROOT);
        format.setLenient(false);
        format.setTimeZone(MOSCOW);
        try { return format.parse(value).getTime(); }
        catch (Exception error) { return -1; }
    }

    static final class Lesson {
        final String date, time, title, room;
        final long start, end;
        Lesson(JSONObject data) {
            date = data.optString("date");
            time = data.optString("start");
            title = data.optString("title");
            room = data.optString("room");
            start = parse(date + " " + time, "yyyy-MM-dd HH:mm");
            end = parse(date + " " + data.optString("end"), "yyyy-MM-dd HH:mm");
        }
    }

    static final class Day {
        final String today;
        final List<Lesson> lessons = new ArrayList<>();
        Lesson next;
        boolean covered;
        Day(String today) { this.today = today; }
    }

    static Day read(Context context, String group, long now) {
        JSONObject data = load(context);
        String today = day(now);
        Day result = new Day(today);
        JSONObject groups = data.optJSONObject("groups");
        JSONArray records = groups == null ? null : groups.optJSONArray(group);
        if (records == null) return result;
        result.covered = today.compareTo(data.optString("fromDate")) >= 0 && today.compareTo(data.optString("toDate")) <= 0;
        for (int i = 0; i < records.length(); i++) {
            JSONObject record = records.optJSONObject(i);
            if (record == null) continue;
            Lesson lesson = new Lesson(record);
            if (lesson.title.isEmpty() || lesson.start < 0 || lesson.end <= lesson.start) continue;
            if (today.equals(lesson.date)) result.lessons.add(lesson);
            if (lesson.end > now && (result.next == null || lesson.start < result.next.start)) result.next = lesson;
        }
        result.lessons.sort(Comparator.comparingLong(lesson -> lesson.start));
        return result;
    }
}
