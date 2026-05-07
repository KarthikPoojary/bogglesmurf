package com.bogglesmurf.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.bogglesmurf.app.MainActivity;
import com.bogglesmurf.app.R;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class OverlayService extends Service {

    public static final String ACTION_SHOW = "com.bogglesmurf.overlay.SHOW";
    public static final String ACTION_HIDE = "com.bogglesmurf.overlay.HIDE";

    private static final String CHANNEL_ID = "bogglesmurf_overlay";
    private static final int NOTIF_ID = 1001;
    private static final int MAX_WORDS = 60;

    private static List<String> allWords = Collections.emptyList();
    private static Set<String> commonWordSet = new HashSet<>();
    private static float overlayAlpha = 0.85f;
    private static OverlayService instance;

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams overlayParams;
    private ArrayAdapter<String> wordAdapter;
    private boolean isShowing = false;
    private String currentTab = "COM";

    // ── Static setters (called from OverlayPlugin on any thread) ────────────

    public static void setWords(List<String> words, Set<String> common) {
        allWords = new ArrayList<>(words);
        commonWordSet = new HashSet<>(common);
        if (instance != null) instance.refreshWordList();
    }

    public static void setAlpha(float alpha) {
        overlayAlpha = alpha;
        if (instance != null && instance.isShowing && instance.overlayView != null) {
            instance.overlayView.setAlpha(alpha);
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    }

    @Override
    public void onDestroy() {
        instance = null;
        removeOverlay();
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        ensureForeground();
        String action = intent.getAction();
        if (ACTION_SHOW.equals(action)) {
            showOverlay();
        } else if (ACTION_HIDE.equals(action)) {
            removeOverlay();
            stopSelf();
        }
        return START_STICKY;
    }

    // ── Overlay window ────────────────────────────────────────────────────────

    private void showOverlay() {
        if (isShowing) {
            refreshWordList();
            return;
        }

        overlayView = LayoutInflater.from(this).inflate(R.layout.overlay_layout, null);
        overlayView.setAlpha(overlayAlpha);

        int layerType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        overlayParams = new WindowManager.LayoutParams(
            dpToPx(180), dpToPx(320),
            layerType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        overlayParams.gravity = Gravity.TOP | Gravity.END;
        overlayParams.x = dpToPx(8);
        overlayParams.y = dpToPx(100);

        overlayView.findViewById(R.id.overlay_close).setOnClickListener(v -> {
            removeOverlay();
            stopSelf();
        });

        overlayView.findViewById(R.id.overlay_header)
            .setOnTouchListener(new HeaderDragListener());

        // Tab click listeners
        overlayView.findViewById(R.id.tab_com).setOnClickListener(v -> switchTab("COM"));
        overlayView.findViewById(R.id.tab_unq).setOnClickListener(v -> switchTab("UNQ"));
        overlayView.findViewById(R.id.tab_all).setOnClickListener(v -> switchTab("ALL"));

        ListView listView = overlayView.findViewById(R.id.overlay_words);
        wordAdapter = new ArrayAdapter<>(this, R.layout.overlay_word_item, new ArrayList<>());
        listView.setAdapter(wordAdapter);

        windowManager.addView(overlayView, overlayParams);
        isShowing = true;

        refreshWordList();
    }

    private void switchTab(String tab) {
        currentTab = tab;
        updateTabHighlight();
        refreshWordList();
    }

    private void updateTabHighlight() {
        if (overlayView == null) return;
        int[] ids = { R.id.tab_com, R.id.tab_unq, R.id.tab_all };
        String[] tabs = { "COM", "UNQ", "ALL" };
        for (int i = 0; i < ids.length; i++) {
            TextView tv = overlayView.findViewById(ids[i]);
            if (tabs[i].equals(currentTab)) {
                tv.setBackgroundColor(0xFF312E81);
                tv.setTextColor(0xFFC084FC);
            } else {
                tv.setBackgroundColor(0x00000000);
                tv.setTextColor(0xFF64748B);
            }
        }
    }

    private void refreshWordList() {
        if (wordAdapter == null) return;
        List<String> filtered = getTabWords();
        List<String> display = filtered.size() > MAX_WORDS ? filtered.subList(0, MAX_WORDS) : filtered;
        wordAdapter.clear();
        wordAdapter.addAll(display);
        wordAdapter.notifyDataSetChanged();
    }

    private List<String> getTabWords() {
        List<String> result = new ArrayList<>();
        for (String w : allWords) {
            boolean isCommon = commonWordSet.contains(w);
            if ("COM".equals(currentTab) && isCommon) result.add(w);
            else if ("UNQ".equals(currentTab) && !isCommon) result.add(w);
            else if ("ALL".equals(currentTab)) result.add(w);
        }
        return result;
    }

    private void removeOverlay() {
        if (isShowing && overlayView != null) {
            windowManager.removeView(overlayView);
            overlayView = null;
            overlayParams = null;
            wordAdapter = null;
            isShowing = false;
        }
    }

    // ── Foreground notification ───────────────────────────────────────────────

    private void ensureForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "BoggleSmurf Overlay", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps the word overlay running while you play");
            ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE))
                .createNotificationChannel(ch);
        }
        PendingIntent pi = PendingIntent.getActivity(
            this, 0,
            new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE
        );
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BoggleSmurf")
            .setContentText("Word overlay active — tap to return to app")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();

        // Android 14 (API 34) requires the foreground service type to be passed explicitly
        // when foregroundServiceType is declared in the manifest.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    private class HeaderDragListener implements View.OnTouchListener {
        private float startRawX, startRawY;
        private int startParamX, startParamY;

        @Override
        public boolean onTouch(View v, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    startRawX = event.getRawX();
                    startRawY = event.getRawY();
                    startParamX = overlayParams.x;
                    startParamY = overlayParams.y;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    overlayParams.x = startParamX + (int)(startRawX - event.getRawX());
                    overlayParams.y = startParamY + (int)(event.getRawY() - startRawY);
                    if (overlayView != null) windowManager.updateViewLayout(overlayView, overlayParams);
                    return true;
            }
            return false;
        }
    }
}
