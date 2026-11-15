package io.github.arduradiokot.siriuswiki;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.SystemClock;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.json.JSONObject;

public final class WidgetRefreshJob extends JobService {
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static long lastAttempt = -30 * 60_000;
    private final ConcurrentHashMap<JobParameters, Future<?>> active = new ConcurrentHashMap<>();

    @Override public boolean onStartJob(JobParameters job) {
        java.util.concurrent.FutureTask<Void> task = new java.util.concurrent.FutureTask<>(() -> {
            try {
                boolean manual = job.getExtras().getBoolean("manual");
                long now = SystemClock.elapsedRealtime();
                if (now - lastAttempt >= (manual ? 15_000 : 30 * 60_000)) {
                    lastAttempt = now;
                    String data = AccountPlugin.read(WidgetSchedule.URL, false, 2 * 1024 * 1024);
                    if (!Thread.currentThread().isInterrupted()) {
                        WidgetSchedule.save(this, new JSONObject(data));
                        ScheduleWidget.redraw(this);
                    }
                }
            } catch (Exception ignored) {
                // The widget keeps showing its most recent local copy.
            } finally {
                if (active.remove(job) != null) jobFinished(job, false);
            }
            return null;
        });
        active.put(job, task);
        worker.execute(task);
        return true;
    }

    @Override public boolean onStopJob(JobParameters job) {
        Future<?> task = active.remove(job);
        if (task != null) task.cancel(true);
        return true;
    }
}
