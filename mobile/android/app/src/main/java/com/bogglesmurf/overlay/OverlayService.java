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
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.GridView;
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
    private static final int    MAX_WORDS   = 200;

    // ── Static state (set from OverlayPlugin / SwipePlugin) ─────────────────

    private static List<WordEntry> wordEntries = Collections.emptyList();
    private static Set<String>     commonWordSet = new HashSet<>();
    private static float           overlayAlpha  = 0.85f;

    // Calibration (percentages of screen dimensions)
    private static float calGridLeftPct  = 5f;
    private static float calGridTopPct   = 28f;
    private static float calGridWidthPct = 90f;
    private static int   calGridSize     = 4;
    private static long  calSwipeDelayMs = 400L;

    private static OverlayService instance;

    // ── Static setters ────────────────────────────────────────────────────────

    public static void setWords(List<WordEntry> entries, Set<String> common) {
        // Reset done state when new words arrive
        for (WordEntry e : entries) e.isDone = false;
        wordEntries = new ArrayList<>(entries);
        commonWordSet = new HashSet<>(common);
        if (instance != null) {
            instance.refreshWordList();
            // A capture-driven refresh implicitly clears the scanning status
            setStatus(null, false);
        }
    }

    public static void setAlpha(float alpha) {
        overlayAlpha = alpha;
        if (instance != null && instance.isShowing && instance.overlayView != null) {
            instance.overlayView.setAlpha(alpha);
        }
    }

    /** Temporarily make the overlay window pass gestures through to whatever is beneath it. */
    public static void setTouchPassthrough(boolean passthrough) {
        if (instance == null || !instance.isShowing || instance.overlayView == null) return;
        if (passthrough) {
            instance.overlayParams.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        } else {
            instance.overlayParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        }
        try {
            instance.windowManager.updateViewLayout(instance.overlayView, instance.overlayParams);
        } catch (Exception ignored) {}
    }

    /** Returns [leftPct, topPct, widthPct, swipeDelayMs] for JS to read back after drag-calibration. */
    public static float[] getCalibrationValues() {
        return new float[]{ calGridLeftPct, calGridTopPct, calGridWidthPct, calSwipeDelayMs };
    }

    public static void setCalibration(float leftPct, float topPct, float widthPct, int gridSize, long swipeDelayMs) {
        calGridLeftPct  = leftPct;
        calGridTopPct   = topPct;
        calGridWidthPct = widthPct;
        calGridSize     = gridSize;
        calSwipeDelayMs = swipeDelayMs;
        if (instance != null && instance.isCalibrationShowing) {
            instance.updateCalibrationWindow();
            if (instance.calibrationView != null) instance.calibrationView.postInvalidate();
        }
    }

    // ── Capture flow ──────────────────────────────────────────────────────────

    /** Callback fired when a fresh screenshot of the calibrated grid is ready (base64 JPEG). */
    public interface CaptureListener { void onCapture(String base64Image, String mimeType); }
    private static CaptureListener captureListener;

    public static void setOnCaptureListener(CaptureListener listener) {
        captureListener = listener;
    }

    /** Show or hide the "Scanning…" status overlay over the word list. */
    public static void setStatus(String text, boolean spinner) {
        if (instance == null || instance.overlayView == null) return;
        instance.overlayView.post(() -> {
            View statusBox = instance.overlayView.findViewById(R.id.overlay_status);
            TextView statusText = instance.overlayView.findViewById(R.id.overlay_status_text);
            View spinnerView = instance.overlayView.findViewById(R.id.overlay_status_spinner);
            if (statusBox == null || statusText == null || spinnerView == null) return;
            if (text == null || text.isEmpty()) {
                statusBox.setVisibility(View.GONE);
            } else {
                statusText.setText(text);
                spinnerView.setVisibility(spinner ? View.VISIBLE : View.GONE);
                statusBox.setVisibility(View.VISIBLE);
            }
        });
    }

    /** True iff the overlay is visible AND the accessibility service is connected. */
    public static boolean canCapture() {
        return instance != null && instance.isShowing
            && BoggleAccessibilityService.getInstance() != null;
    }

    /**
     * Hide the overlay briefly, screenshot the calibrated grid area, then notify
     * the registered capture listener. JS is responsible for the OCR → solve →
     * setWords pipeline that follows.
     */
    private void triggerCapture() {
        BoggleAccessibilityService svc = BoggleAccessibilityService.getInstance();
        if (svc == null) {
            setStatus("Enable BoggleSmurf accessibility service first", false);
            return;
        }
        if (captureListener == null) {
            setStatus("Capture handler not registered", false);
            return;
        }

        // Compute pixel bounds of the calibrated grid
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int left   = Math.round(dm.widthPixels  * calGridLeftPct  / 100f);
        int top    = Math.round(dm.heightPixels * calGridTopPct   / 100f);
        int width  = Math.round(dm.widthPixels  * calGridWidthPct / 100f);
        // Calibration grid is rendered square (height == width)
        Rect bounds = new Rect(left, top, left + width, top + width);

        setStatus("Capturing…", true);

        // Make overlay invisible & non-interactive so it doesn't appear in the screenshot
        if (overlayView != null) overlayView.setVisibility(View.INVISIBLE);
        setTouchPassthrough(true);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            svc.captureGridArea(bounds, (base64, mime) -> {
                // Restore overlay visibility immediately so user sees status
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (overlayView != null) overlayView.setVisibility(View.VISIBLE);
                    setTouchPassthrough(false);
                });
                if (base64 == null) {
                    setStatus("Capture failed — check accessibility permission", false);
                    return;
                }
                setStatus("Reading grid…", true);
                if (captureListener != null) captureListener.onCapture(base64, mime);
            });
        }, 120);
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

    private View                       calibrationView      = null;
    private WindowManager.LayoutParams calibrationParams    = null;
    private boolean                    isCalibrationShowing = false;

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
            dpToPx(220), dpToPx(320),
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
        overlayView.findViewById(R.id.overlay_capture).setOnClickListener(v -> triggerCapture());
        overlayView.findViewById(R.id.overlay_header).setOnTouchListener(new HeaderDragListener());

        overlayView.findViewById(R.id.tab_com).setOnClickListener(v -> switchTab("COM"));
        overlayView.findViewById(R.id.tab_unq).setOnClickListener(v -> switchTab("UNQ"));
        overlayView.findViewById(R.id.tab_all).setOnClickListener(v -> switchTab("ALL"));

        GridView grid = overlayView.findViewById(R.id.overlay_words);
        wordAdapter = new WordAdapter();
        grid.setAdapter(wordAdapter);

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
                svc.swipeWord(entry.path, calGridLeftPct, calGridTopPct, calGridWidthPct, calGridSize, calSwipeDelayMs);
                entry.isDone = true;
                notifyDataSetChanged();
            });

            return convertView;
        }
    }

    // ── Calibration grid overlay ──────────────────────────────────────────────

    private void showCalibrationGrid() {
        if (isCalibrationShowing) {
            updateCalibrationWindow();
            if (calibrationView != null) calibrationView.postInvalidate();
            return;
        }
        calibrationView = new CalibrationView(this);

        int layerType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        calibrationParams = buildCalibrationParams(layerType);
        windowManager.addView(calibrationView, calibrationParams);
        isCalibrationShowing = true;
    }

    private WindowManager.LayoutParams buildCalibrationParams(int layerType) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int left  = Math.round(dm.widthPixels  * calGridLeftPct  / 100f);
        int top   = Math.round(dm.heightPixels * calGridTopPct   / 100f);
        int width = Math.round(dm.widthPixels  * calGridWidthPct / 100f);
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            width, width,
            layerType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = left;
        p.y = top;
        return p;
    }

    private void updateCalibrationWindow() {
        if (!isCalibrationShowing || calibrationView == null || calibrationParams == null) return;
        DisplayMetrics dm = getResources().getDisplayMetrics();
        calibrationParams.x      = Math.round(dm.widthPixels  * calGridLeftPct  / 100f);
        calibrationParams.y      = Math.round(dm.heightPixels * calGridTopPct   / 100f);
        calibrationParams.width  = Math.round(dm.widthPixels  * calGridWidthPct / 100f);
        calibrationParams.height = calibrationParams.width;
        try { windowManager.updateViewLayout(calibrationView, calibrationParams); } catch (Exception ignored) {}
    }

    private void removeCalibrationView() {
        if (isCalibrationShowing && calibrationView != null) {
            windowManager.removeView(calibrationView);
            calibrationView   = null;
            calibrationParams = null;
            isCalibrationShowing = false;
        }
    }

    private class CalibrationView extends View {
        private static final int MODE_NONE   = 0;
        private static final int MODE_DRAG   = 1;
        private static final int MODE_RESIZE = 2;

        private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint fillPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint textPaint   = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint handlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

        private int   mode = MODE_NONE;
        private final float handle; // px touch zone for resize corner

        // Sticky-finger: anchored at the raw screen position where the gesture started
        private float rawDownX, rawDownY;
        private float valAtDown1, valAtDown2; // left+top pcts (drag) or width pct (resize)

        CalibrationView(Context ctx) {
            super(ctx);
            handle = 52 * ctx.getResources().getDisplayMetrics().density;

            borderPaint.setColor(0xFF00E676);
            borderPaint.setStyle(Paint.Style.STROKE);
            borderPaint.setStrokeWidth(3f);

            fillPaint.setColor(0x1A00E676);
            fillPaint.setStyle(Paint.Style.FILL);

            textPaint.setColor(0xFFFFFFFF);
            textPaint.setTextSize(26f);
            textPaint.setShadowLayer(4f, 0, 0, 0xFF000000);

            handlePaint.setColor(0xFF00E676);
            handlePaint.setStyle(Paint.Style.FILL);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            // View bounds match the grid exactly — draw in local coords (origin = grid top-left)
            float w = getWidth();
            float cellSize = w / calGridSize;

            for (int r = 0; r < calGridSize; r++) {
                for (int c = 0; c < calGridSize; c++) {
                    float x = c * cellSize, y = r * cellSize;
                    canvas.drawRect(x, y, x + cellSize, y + cellSize, fillPaint);
                    canvas.drawRect(x, y, x + cellSize, y + cellSize, borderPaint);
                    String lbl = r + "," + c;
                    float tw = textPaint.measureText(lbl);
                    canvas.drawText(lbl, x + (cellSize - tw) / 2f, y + cellSize / 2f + 9f, textPaint);
                }
            }

            // Resize handle — filled square at bottom-right corner
            float hs = handle * 0.55f;
            canvas.drawRect(w - hs, w - hs, w, w, handlePaint);
        }

        @Override
        public boolean onTouchEvent(MotionEvent ev) {
            float w = getWidth(); // view width == grid width in px
            float ex = ev.getX(), ey = ev.getY();

            switch (ev.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    if (ex >= w - handle && ey >= w - handle) {
                        mode = MODE_RESIZE;
                        rawDownX   = ev.getRawX();
                        valAtDown1 = calGridWidthPct;
                    } else {
                        mode = MODE_DRAG;
                        rawDownX   = ev.getRawX();
                        rawDownY   = ev.getRawY();
                        valAtDown1 = calGridLeftPct;
                        valAtDown2 = calGridTopPct;
                    }
                    return true;

                case MotionEvent.ACTION_MOVE:
                    DisplayMetrics dm = getResources().getDisplayMetrics();
                    float sw = dm.widthPixels, sh = dm.heightPixels;
                    if (mode == MODE_DRAG) {
                        calGridLeftPct = Math.max(0,  Math.min(50, valAtDown1 + (ev.getRawX() - rawDownX) / sw * 100));
                        calGridTopPct  = Math.max(0,  Math.min(70, valAtDown2 + (ev.getRawY() - rawDownY) / sh * 100));
                    } else if (mode == MODE_RESIZE) {
                        calGridWidthPct = Math.max(30, Math.min(100, valAtDown1 + (ev.getRawX() - rawDownX) / sw * 100));
                    }
                    updateCalibrationWindow(); // reposition window to follow the drag
                    postInvalidate();
                    return true;

                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    mode = MODE_NONE;
                    return true;
            }
            return false;
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
