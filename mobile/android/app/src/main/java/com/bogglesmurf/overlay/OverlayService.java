package com.bogglesmurf.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
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

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.bogglesmurf.app.MainActivity;
import com.bogglesmurf.app.R;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class OverlayService extends Service {

    public static final String ACTION_SHOW = "com.bogglesmurf.overlay.SHOW";
    public static final String ACTION_HIDE = "com.bogglesmurf.overlay.HIDE";

    private static final String CHANNEL_ID = "bogglesmurf_overlay";
    private static final int NOTIF_ID = 1001;
    private static final int MAX_WORDS = 40;

    // Static state so OverlayPlugin can push words from any thread
    private static List<String> words = Collections.emptyList();
    private static OverlayService instance;

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams overlayParams;
    private ArrayAdapter<String> wordAdapter;
    private boolean isShowing = false;

    public static void setWords(List<String> newWords) {
        words = new ArrayList<>(newWords);
        if (instance != null) {
            instance.refreshWordList();
        }
    }

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

    private void showOverlay() {
        if (isShowing) {
            refreshWordList();
            return;
        }

        overlayView = LayoutInflater.from(this).inflate(R.layout.overlay_layout, null);

        int layerType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        overlayParams = new WindowManager.LayoutParams(
            dpToPx(180),
            dpToPx(300),
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

        ListView listView = overlayView.findViewById(R.id.overlay_words);
        List<String> display = words.size() > MAX_WORDS ? words.subList(0, MAX_WORDS) : words;
        wordAdapter = new ArrayAdapter<>(this, R.layout.overlay_word_item, new ArrayList<>(display));
        listView.setAdapter(wordAdapter);

        windowManager.addView(overlayView, overlayParams);
        isShowing = true;
    }

    private void refreshWordList() {
        if (wordAdapter == null) return;
        wordAdapter.clear();
        List<String> display = words.size() > MAX_WORDS ? words.subList(0, MAX_WORDS) : words;
        wordAdapter.addAll(display);
        wordAdapter.notifyDataSetChanged();
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
        startForeground(NOTIF_ID, notif);
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

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
                    overlayParams.x = startParamX + (int) (startRawX - event.getRawX());
                    overlayParams.y = startParamY + (int) (event.getRawY() - startRawY);
                    if (overlayView != null) {
                        windowManager.updateViewLayout(overlayView, overlayParams);
                    }
                    return true;
            }
            return false;
        }
    }
}
