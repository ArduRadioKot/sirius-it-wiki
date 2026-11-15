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
import android.os.Bundle;
import android.os.PersistableBundle;
import android.view.View;
import android.widget.RemoteViews;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public abstract class ScheduleWidget extends AppWidgetProvider {
    static final String ROUTE = "io.github.arduradiokot.siriuswiki.WIDGET_ROUTE";
    private static final String UPDATE = "io.github.arduradiokot.siriuswiki.REFRESH_WIDGETS";
    private static final String CLOCK = "io.github.arduradiokot.siriuswiki.WIDGET_CLOCK";
    private static final int FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    private static final Class<?>[] PROVIDERS = { Next.class, Day.class, Board.class };
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
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

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (UPDATE.equals(action)) perform(context, true, true);
        if (CLOCK.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_DATE_CHANGED.equals(action)
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
        WidgetSchedule.Day day = WidgetSchedule.read(context, group, now);
        int[] layouts = { R.layout.widget_next, R.layout.widget_day, R.layout.widget_board };
        boolean hasWidgets = false;
        for (int i = 0; i < PROVIDERS.length; i++) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, PROVIDERS[i]))) {
                hasWidgets = true;
                Bundle options = manager.getAppWidgetOptions(id);
                int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, i == 2 ? 220 : 155);
                manager.updateAppWidget(id, view(context, layouts[i], group, day, now, height));
            }
        }
        if (hasWidgets) planClock(context, day, now);
        return hasWidgets;
    }

    private static RemoteViews view(Context context, int layout, String group, WidgetSchedule.Day day, long now, int height) {
        RemoteViews view = new RemoteViews(context.getPackageName(), layout);
        String today = "#/schedule?date=" + day.today;
        view.setOnClickPendingIntent(R.id.widget_root, launch(context, today));
        String empty = day.covered ? "На сегодня пар нет" : "Расписание пока недоступно";
        if (layout == R.layout.widget_next) {
            WidgetSchedule.Lesson lesson = day.next;
            String label = lesson == null ? group : lesson.start <= now ? "Сейчас · " + lesson.time
                : lesson.date.equals(day.today) ? "Следующая · " + lesson.time
                : WidgetSchedule.dayLabel(lesson.date) + " · " + lesson.time;
            view.setTextViewText(R.id.widget_kicker, label);
            view.setTextViewText(R.id.widget_title, lesson == null ? day.lessons.isEmpty() ? empty : "Пары закончились" : lesson.title);
            view.setTextViewText(R.id.widget_details, lesson == null ? "" : lesson.room);
            view.setViewVisibility(R.id.widget_details, lesson == null || lesson.room.isEmpty() ? View.GONE : View.VISIBLE);
            if (lesson != null) {
                view.setContentDescription(R.id.widget_root, label + ". " + lesson.title + ". " + lesson.room);
                view.setOnClickPendingIntent(R.id.widget_root, launch(context, "#/schedule?date=" + lesson.date));
            }
            return view;
        }

        view.setTextViewText(R.id.widget_kicker, WidgetSchedule.dayLabel(day.today) + " · " + group);
        view.setOnClickPendingIntent(R.id.widget_refresh, broadcast(context, UPDATE));
        view.removeAllViews(R.id.widget_rows);
        int rows = Math.max(1, Math.min(layout == R.layout.widget_board ? 6 : 4,
            (height - (layout == R.layout.widget_board ? 123 : 75)) / 26));
        for (int i = 0; i < Math.min(rows, day.lessons.size()); i++) {
            WidgetSchedule.Lesson lesson = day.lessons.get(i);
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_lesson);
            row.setTextViewText(R.id.widget_lesson_time, lesson.time);
            row.setTextViewText(R.id.widget_lesson_name, (lesson.start <= now && now < lesson.end ? "● " : "") + lesson.title);
            row.setTextViewText(R.id.widget_lesson_room, lesson.room);
            row.setOnClickPendingIntent(R.id.widget_lesson_row, launch(context, today));
            view.addView(R.id.widget_rows, row);
        }
        int more = day.lessons.size() - rows;
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

    private static void planClock(Context context, WidgetSchedule.Day day, long now) {
        long next = now + 30 * 60_000;
        if (day.next != null) next = Math.min(next, day.next.start > now ? day.next.start : day.next.end);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.set(AlarmManager.RTC, Math.max(next, now + 1000), broadcast(context, CLOCK));
    }
}
