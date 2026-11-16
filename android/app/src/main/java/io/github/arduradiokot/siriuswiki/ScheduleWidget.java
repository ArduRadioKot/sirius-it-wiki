package io.github.arduradiokot.siriuswiki;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Build;
import android.os.Bundle;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public abstract class ScheduleWidget extends AppWidgetProvider {
    static final String ROUTE = "io.github.arduradiokot.siriuswiki.WIDGET_ROUTE";
    private static final String UPDATE = "io.github.arduradiokot.siriuswiki.REFRESH_WIDGETS";
    private static final String CLOCK = "io.github.arduradiokot.siriuswiki.WIDGET_CLOCK";
    private static final String RING_CLOCK = "io.github.arduradiokot.siriuswiki.WIDGET_RING_CLOCK";
    private static final int RING_ACCENT = 0xFF05DBD0;
    private static final int RING_BREAK = 0xFFA99EE6;
    private static final int RING_TRACK = 0xFF22292B;
    private static final long DAY_MS = 24 * 3_600_000L;
    private static final int FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    private static final Class<?>[] PROVIDERS = { Next.class, Day.class, Board.class };
    private static final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private static ScheduledFuture<?> localBoundary;
    abstract int layout();

    public static final class Next extends ScheduleWidget { @Override int layout() { return R.layout.widget_next; } }
    public static final class Day extends ScheduleWidget { @Override int layout() { return R.layout.widget_day; } }
    public static final class Board extends ScheduleWidget { @Override int layout() { return R.layout.widget_board; } }

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        perform(context, true, false);
    }

    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        perform(context, false, false);
    }

    @Override public void onDisabled(Context context) {
        redraw(context);
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (UPDATE.equals(action)) perform(context, true, true);
        if (CLOCK.equals(action) || RING_CLOCK.equals(action)
            || AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)
            || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
            || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) perform(context, false, false);
    }

    static void redraw(Context context) {
        Context app = context.getApplicationContext();
        worker.execute(() -> renderAll(app));
    }

    private void perform(Context context, boolean network, boolean manual) {
        PendingResult result = goAsync();
        Context app = context.getApplicationContext();
        worker.execute(() -> {
            try {
                if (renderAll(app) && network) queueRefresh(app, manual);
            } finally {
                if (result != null) result.finish();
            }
        });
    }

    private static void queueRefresh(Context context, boolean manual) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        int id = manual ? 3411 : 3410;
        if (scheduler == null || scheduler.getPendingJob(id) != null) return;
        PersistableBundle extras = new PersistableBundle();
        extras.putBoolean("manual", manual);
        JobInfo job = new JobInfo.Builder(id, new ComponentName(context, WidgetRefreshJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setExtras(extras)
            .build();
        scheduler.schedule(job);
    }

    private static boolean renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        String group = WidgetSchedule.group(context);
        long now = System.currentTimeMillis();
        long elapsedNow = SystemClock.elapsedRealtime();
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        boolean exact = exactTimersAllowed(alarms);
        WidgetSchedule.Day day = WidgetSchedule.read(context, group, now);
        int[] layouts = { R.layout.widget_next, R.layout.widget_day, R.layout.widget_board };
        boolean hasWidgets = false;
        boolean hasCompact = false;
        for (int i = 0; i < PROVIDERS.length; i++) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[i]))) {
                hasWidgets = true;
                hasCompact |= i == 0;
                Bundle options = manager.getAppWidgetOptions(id);
                int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, i == 2 ? 220 : 155);
                manager.updateAppWidget(id, view(context, layouts[i], group, day, now, elapsedNow, height));
            }
        }
        if (alarms != null) {
            if (hasWidgets) planClock(context, alarms, day, now, hasCompact, exact);
            else {
                cancelLocalBoundary();
                alarms.cancel(broadcast(context, CLOCK));
                alarms.cancel(broadcast(context, RING_CLOCK));
            }
        }
        return hasWidgets;
    }

    private static RemoteViews view(Context context, int layout, String group, WidgetSchedule.Day day, long now, long elapsedNow, int height) {
        RemoteViews view = new RemoteViews(context.getPackageName(), layout);
        String today = "#/schedule?date=" + day.today;
        view.setOnClickPendingIntent(R.id.widget_root, launch(context, today));
        String empty = day.covered ? "На сегодня пар нет" : "Расписание пока недоступно";
        WidgetSchedule.Lesson lesson = day.next;
        boolean live = lesson != null && lesson.start <= now;
        long deadline = day.deadline(now);
        long timeLeft = Math.max(0, deadline - now);
        String label = lesson == null ? group : live ? "До " + lesson.endTime
            : lesson.date.equals(day.today) ? "В " + lesson.time : WidgetSchedule.dayLabel(lesson.date);
        boolean showSeconds = timeLeft > 0;
        // Older hosts tick from attachment time. Center their rounding to limit rollover drift.
        long rounding = Build.VERSION.SDK_INT >= 36 ? 999 : 500;
        long base = elapsedNow + timeLeft + (showSeconds ? rounding : 0);
        if (layout == R.layout.widget_next) {
            view.setContentDescription(R.id.widget_root, null);
            long from = live ? lesson.start : day.previousEnd;
            float remaining = day.hasCountdown() && deadline > from ? (float) timeLeft / (deadline - from) : 0;
            boolean onBreak = day.hasCountdown() && !live && from > day.midnight;
            int ringColor = onBreak ? RING_BREAK : RING_ACCENT;
            String status = live ? "До конца" : onBreak ? "Перемена"
                : day.hasCountdown() ? "До первой" : lesson != null ? "Следующая пара" : label;
            view.setTextViewText(R.id.widget_clock, "—");
            view.setViewVisibility(R.id.widget_clock, showSeconds ? View.GONE : View.VISIBLE);
            view.setTextViewTextSize(R.id.widget_countdown, TypedValue.COMPLEX_UNIT_SP,
                timeLeft >= 360_000_000 ? 7 : timeLeft >= 36_000_000 ? 8 : timeLeft >= 3_600_000 ? 9 : 11);
            showTimer(view, base, null, showSeconds);
            view.setImageViewBitmap(R.id.widget_ring, countdownRing(remaining, ringColor));
            view.setTextViewText(R.id.widget_kicker, status);
            view.setTextColor(R.id.widget_kicker, ringColor);
            view.setTextViewText(R.id.widget_title, lesson == null ? day.lessons.isEmpty() ? empty : "Пары закончились" : lesson.title);
            String details = lesson == null ? "" : lesson.room;
            if (lesson != null) {
                String time = live ? lesson.endTime : day.hasCountdown() ? lesson.time
                    : WidgetSchedule.dayLabel(lesson.date) + " · " + lesson.time;
                details = details.isEmpty() ? time : time + " · " + details;
            }
            view.setTextViewText(R.id.widget_details, details);
            view.setViewVisibility(R.id.widget_details, details.isEmpty() ? View.GONE : View.VISIBLE);
            view.setContentDescription(R.id.widget_kicker, null);
            if (lesson != null) {
                String timing = live ? "До конца пары, " : onBreak ? "До конца перемены, "
                    : day.hasCountdown() ? "До первой пары, " : "До следующей пары, " + WidgetSchedule.dayLabel(lesson.date) + " в ";
                view.setContentDescription(R.id.widget_kicker, timing + (live ? lesson.endTime : lesson.time));
                view.setOnClickPendingIntent(R.id.widget_root, launch(context, "#/schedule?date=" + lesson.date));
            }
            return view;
        }

        view.setTextViewText(R.id.widget_kicker, WidgetSchedule.dayLabel(day.today) + " · " + group);
        showTimer(view, base, live ? "До конца %s" : "До пары %s", showSeconds);
        view.setOnClickPendingIntent(R.id.widget_refresh, broadcast(context, UPDATE));
        view.removeAllViews(R.id.widget_rows);
        List<WidgetSchedule.Lesson> remaining = new ArrayList<>();
        for (WidgetSchedule.Lesson item : day.lessons) if (item.end > now) remaining.add(item);
        List<WidgetSchedule.Lesson> shown = remaining.isEmpty() ? day.lessons : remaining;
        int rows = Math.max(1, Math.min(layout == R.layout.widget_board ? 6 : 4,
            (height - (layout == R.layout.widget_board ? 123 : 75) - (deadline > 0 ? 18 : 0)) / 26));
        for (int i = 0; i < Math.min(rows, shown.size()); i++) {
            WidgetSchedule.Lesson item = shown.get(i);
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_lesson);
            row.setTextViewText(R.id.widget_lesson_time, item.time);
            row.setTextViewText(R.id.widget_lesson_name, (item.start <= now && now < item.end ? "● " : "") + item.title);
            row.setTextViewText(R.id.widget_lesson_room, item.room);
            row.setOnClickPendingIntent(R.id.widget_lesson_row, launch(context, today));
            view.addView(R.id.widget_rows, row);
        }
        int more = shown.size() - rows;
        view.setViewVisibility(R.id.widget_summary, day.lessons.isEmpty() || more > 0 ? View.VISIBLE : View.GONE);
        view.setTextViewText(R.id.widget_summary, more > 0 ? "Ещё " + more + " · открыть расписание" : empty);
        view.setOnClickPendingIntent(R.id.widget_summary, launch(context, today));
        if (layout == R.layout.widget_board) {
            view.setOnClickPendingIntent(R.id.widget_open_schedule, launch(context, today));
            view.setOnClickPendingIntent(R.id.widget_open_account, launch(context, "#/study/account"));
            view.setOnClickPendingIntent(R.id.widget_open_review, launch(context, "#/study/review"));
        }
        return view;
    }

    private static void showTimer(RemoteViews view, long base, String format, boolean visible) {
        // Setting the base renders the text immediately, using the format already present on the host.
        view.setString(R.id.widget_countdown, "setFormat", format);
        view.setChronometerCountDown(R.id.widget_countdown, true);
        view.setChronometer(R.id.widget_countdown, base, format, visible);
        view.setViewVisibility(R.id.widget_countdown, visible ? View.VISIBLE : View.GONE);
    }

    private static Bitmap countdownRing(float remaining, int color) {
        Bitmap bitmap = Bitmap.createBitmap(144, 144, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(1.2f, 1.2f);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(9);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(RING_TRACK);
        canvas.drawCircle(60, 60, 54, paint);
        if (remaining > 0) {
            paint.setColor(color);
            canvas.drawArc(6, 6, 114, 114, -90, 360 * Math.min(1, remaining), false, paint);
        }
        return bitmap;
    }

    private static PendingIntent launch(Context context, String route) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(ROUTE + route)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(ROUTE, route);
        return PendingIntent.getActivity(context, 0, intent, FLAGS);
    }

    private static PendingIntent broadcast(Context context, String action) {
        return PendingIntent.getBroadcast(context, 0, new Intent(context, Next.class).setAction(action), FLAGS);
    }

    static boolean exactTimersAllowed(AlarmManager alarms) {
        return alarms != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms());
    }

    private static void cancelLocalBoundary() {
        if (localBoundary != null) localBoundary.cancel(false);
        localBoundary = null;
    }

    private static void planClock(Context context, AlarmManager alarms, WidgetSchedule.Day day, long now, boolean hasCompact, boolean exact) {
        long deadline = day.deadline(now);
        long boundary = day.midnight + DAY_MS;
        if (deadline > now) boundary = Math.min(boundary, deadline);
        PendingIntent refresh = broadcast(context, RING_CLOCK);
        long nextMinute = (now / 60_000 + 1) * 60_000;
        if (hasCompact && day.hasCountdown() && nextMinute < boundary) {
            alarms.set(AlarmManager.RTC, nextMinute, refresh);
        } else alarms.cancel(refresh);

        cancelLocalBoundary();
        PendingIntent pending = broadcast(context, CLOCK);
        if (exact) {
            try {
                alarms.setExact(AlarmManager.RTC, boundary, pending);
                return;
            } catch (SecurityException ignored) {
                // If access was revoked while updating the widget, use an inexact alarm.
            }
        }
        // Countdown digits run in the launcher. This timer changes their target while the app process
        // is alive, and the pending alarm can restart the provider if the system stops the process.
        localBoundary = worker.schedule(() -> renderAll(context),
            Math.max(1, boundary - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, boundary, pending);
    }
}
