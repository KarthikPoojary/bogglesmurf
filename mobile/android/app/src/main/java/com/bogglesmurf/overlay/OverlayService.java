package com.bogglesmurf.overlay;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.bogglesmurf.accessibility.BoggleAccessibilityService;
import com.bogglesmurf.app.MainActivity;
import com.bogglesmurf.app.R;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class OverlayService extends Service {

    public static final String ACTION_SHOW             = "com.bogglesmurf.overlay.SHOW";
    public static final String ACTION_HIDE             = "com.bogglesmurf.overlay.HIDE";
    public static final String ACTION_SHOW_CALIBRATION = "com.bogglesmurf.overlay.SHOW_CAL";
    public static final String ACTION_HIDE_CALIBRATION = "com.bogglesmurf.overlay.HIDE_CAL";

    private static final String CHANNEL_ID  = "bogglesmurf_overlay";
    private static final int    NOTIF_ID    = 1001;
    private static final int    MAX_WORDS   = 60;

    // ── Static state (set from OverlayPlugin / SwipePlugin) ─────────────────

    private static List<WordEntry> wordEntries = Collections.emptyList();
    private static Set<String>     commonWordSet = new HashSet<>();
    private static float           overlayAlpha  = 0.85f;

    // Calibration (percentages of screen dimensions)
    private static float calGridLeftPct  = 5f;
    private static float calGridTopPct   = 28f;
    private static float calGridWidthPct = 90f;
    private static int   calGridSize     = 4;

    private static OverlayService instance;

    // ── Static setters ────────────────────────────────────────────────────────

    public static void setWords(List<WordEntry> entries, Set<String> common) {
        // Reset done state when new words arrive
        for (WordEntry e : entries) e.isDone = false;
        wordEntries = new ArrayList<>(entries);
        commonWordSet = new HashSet<>(common);
        if (instance != null) instance.refreshWordList();
    }

    public static void setAlpha(float alpha) {
        overlayAlpha = alpha;
        if (instance != null && instance.isShowing && instance.overlayView != null) {
            instance.overlayView.setAlpha(alpha);
        }
    }

    public static void setCalibration(float leftPct, float topPct, float widthPct, int gridSize) {
        calGridLeftPct  = leftPct;
        calGridTopPct   = topPct;
        calGridWidthPct = widthPct;
        calGridSize     = gridSize;
        if (instance != null && instance.calibrationView != null) {
            instance.calibrationView.postInvalidate();
        }
    }

    // ── WordEntry ─────────────────────────────────────────────────────────────

    public static class WordEntry {
        public String word;
        public int[]  path;    // flat [row0,col0,row1,col1,...]
        public boolean isCommon;
        public boolean isDone = false;

        public WordEntry(String word, int[] path, boolean isCommon) {
            this.word = word;
            this.path = path;
            this.isCommon = isCommon;
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    private WindowManager              windowManager;
    private View                       overlayView;
    private WindowManager.LayoutParams overlayParams;
    private WordAdapter                wordAdapter;
    private boolean                    isShowing  = false;
    private String                     currentTab = "COM";

    private View    calibrationView      = null;
    private boolean isCalibrationShowing = false;

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
        removeCalibrationView();
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        ensureForeground();
        String action = intent.getAction();
        if      (ACTION_SHOW.equals(action))             showOverlay();
        else if (ACTION_HIDE.equals(action))             { removeOverlay();       if (!isCalibrationShowing) stopSelf(); }
        else if (ACTION_SHOW_CALIBRATION.equals(action)) showCalibrationGrid();
        else if (ACTION_HIDE_CALIBRATION.equals(action)) { removeCalibrationView(); if (!isShowing) stopSelf(); }
        return START_STICKY;
    }

    // ── Overlay window ────────────────────────────────────────────────────────

    private void showOverlay() {
        if (isShowing) { refreshWordList(); return; }

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
        overlayView.findViewById(R.id.overlay_header).setOnTouchListener(new HeaderDragListener());

        overlayView.findViewById(R.id.tab_com).setOnClickListener(v -> switchTab("COM"));
        overlayView.findViewById(R.id.tab_unq).setOnClickListener(v -> switchTab("UNQ"));
        overlayView.findViewById(R.id.tab_all).setOnClickListener(v -> switchTab("ALL"));

        ListView listView = overlayView.findViewById(R.id.overlay_words);
        wordAdapter = new WordAdapter();
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
        int[] ids  = { R.id.tab_com, R.id.tab_unq, R.id.tab_all };
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
        wordAdapter.setEntries(getTabEntries());
    }

    private List<WordEntry> getTabEntries() {
        List<WordEntry> result = new ArrayList<>();
        int count = 0;
        for (WordEntry e : wordEntries) {
            if (count >= MAX_WORDS) break;
            if ("COM".equals(currentTab) && !e.isCommon) continue;
            if ("UNQ".equals(currentTab) &&  e.isCommon) continue;
            result.add(e);
            count++;
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

    // ── Custom word adapter ───────────────────────────────────────────────────

    private class WordAdapter extends BaseAdapter {
        private List<WordEntry> entries = new ArrayList<>();

        void setEntries(List<WordEntry> e) {
            entries = e;
            notifyDataSetChanged();
        }

        @Override public int getCount()             { return entries.size(); }
        @Override public Object getItem(int pos)    { return entries.get(pos); }
        @Override public long getItemId(int pos)    { return pos; }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            if (convertView == null) {
                convertView = LayoutInflater.from(OverlayService.this)
                    .inflate(R.layout.overlay_word_item, parent, false);
            }
            WordEntry entry = entries.get(position);

            TextView wordText = convertView.findViewById(R.id.word_text);
            TextView playBtn  = convertView.findViewById(R.id.word_play);

            wordText.setText(entry.word);
            if (entry.isDone) {
                wordText.setPaintFlags(wordText.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG);
                wordText.setAlpha(0.35f);
                playBtn.setAlpha(0.2f);
            } else {
                wordText.setPaintFlags(wordText.getPaintFlags() & ~Paint.STRIKE_THRU_TEXT_FLAG);
                wordText.setAlpha(1.0f);
                playBtn.setAlpha(1.0f);
            }

            playBtn.setOnClickListener(v -> {
                BoggleAccessibilityService svc = BoggleAccessibilityService.getInstance();
                if (svc == null || entry.path == null) return;
                svc.swipeWord(entry.path, calGridLeftPct, calGridTopPct, calGridWidthPct, calGridSize);
                entry.isDone = true;
                notifyDataSetChanged();
            });

            return convertView;
        }
    }

    // ── Calibration grid overlay ──────────────────────────────────────────────

    private void showCalibrationGrid() {
        if (isCalibrationShowing) {
            if (calibrationView != null) calibrationView.postInvalidate();
            return;
        }
        calibrationView = new CalibrationView(this);

        int layerType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            layerType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        windowManager.addView(calibrationView, params);
        isCalibrationShowing = true;
    }

    private void removeCalibrationView() {
        if (isCalibrationShowing && calibrationView != null) {
            windowManager.removeView(calibrationView);
            calibrationView = null;
            isCalibrationShowing = false;
        }
    }

    private class CalibrationView extends View {
        private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fillPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint textPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);

        CalibrationView(Context ctx) {
            super(ctx);
            borderPaint.setColor(0xFF00E676);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(3f);

            fillPaint.setColor(0x1A00E676); // very faint green tint per cell
            fillPaint.setStyle(Paint.Style.FILL);

            textPaint.setColor(0xFFFFFFFF);
            textPaint.setTextSize(28f);
            textPaint.setShadowLayer(4f, 0, 0, 0xFF000000);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            float sw = dm.widthPixels;
            float sh = dm.heightPixels;

            float left     = sw * calGridLeftPct  / 100f;
            float top      = sh * calGridTopPct   / 100f;
            float cellSize = (sw * calGridWidthPct / 100f) / calGridSize;

            for (int r = 0; r < calGridSize; r++) {
                for (int c = 0; c < calGridSize; c++) {
                    float x = left + c * cellSize;
                    float y = top  + r * cellSize;
                    canvas.drawRect(x, y, x + cellSize, y + cellSize, fillPaint);
                    canvas.drawRect(x, y, x + cellSize, y + cellSize, borderPaint);
                    String label = r + "," + c;
                    float tw = textPaint.measureText(label);
                    canvas.drawText(label, x + (cellSize - tw) / 2f, y + cellSize / 2f + 10f, textPaint);
                }
            }
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

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    private class HeaderDragListener implements View.OnTouchListener {
        private float startRawX, startRawY;
        private int   startParamX, startParamY;

        @Override
        public boolean onTouch(View v, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    startRawX  = event.getRawX();
                    startRawY  = event.getRawY();
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
