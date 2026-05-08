package com.bogglesmurf.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Path;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.accessibility.AccessibilityEvent;

import com.bogglesmurf.overlay.OverlayService;

public class BoggleAccessibilityService extends AccessibilityService {

    private static BoggleAccessibilityService instance;

    public static BoggleAccessibilityService getInstance() { return instance; }

    @Override
    public void onServiceConnected() {
        instance = this;
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    /**
     * Dispatches a continuous swipe through each cell in the word path.
     *
     * @param flatPath    [row0, col0, row1, col1, ...] grid positions
     * @param gridLeftPct grid left edge as % of screen width
     * @param gridTopPct  grid top edge as % of screen height
     * @param gridWidthPct grid width as % of screen width
     * @param gridSize    4, 5, or 6
     */
    public void swipeWord(int[] flatPath, float gridLeftPct, float gridTopPct,
                          float gridWidthPct, int gridSize, long delayMs) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return;
        if (flatPath == null || flatPath.length < 2) return;

        // Make overlay pass-through immediately so it doesn't intercept the gesture
        OverlayService.setTouchPassthrough(true);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            float screenW = dm.widthPixels;
            float screenH = dm.heightPixels;

            float gridLeft = screenW * gridLeftPct  / 100f;
            float gridTop  = screenH * gridTopPct   / 100f;
            float cellSize = (screenW * gridWidthPct / 100f) / gridSize;

            Path gesturePath = new Path();
            float x0 = gridLeft + (flatPath[1] + 0.5f) * cellSize;
            float y0 = gridTop  + (flatPath[0] + 0.5f) * cellSize;
            gesturePath.moveTo(x0, y0);

            for (int i = 2; i < flatPath.length; i += 2) {
                float x = gridLeft + (flatPath[i + 1] + 0.5f) * cellSize;
                float y = gridTop  + (flatPath[i]     + 0.5f) * cellSize;
                gesturePath.lineTo(x, y);
            }

            int numCells = flatPath.length / 2;
            long duration = Math.max(numCells * 80L, 200L);

            GestureDescription gesture = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(gesturePath, 0, duration))
                .build();

            dispatchGesture(gesture, new AccessibilityService.GestureResultCallback() {
                @Override public void onCompleted(GestureDescription g) { OverlayService.setTouchPassthrough(false); }
                @Override public void onCancelled(GestureDescription g) { OverlayService.setTouchPassthrough(false); }
            }, null);
        }, delayMs);
    }
}
