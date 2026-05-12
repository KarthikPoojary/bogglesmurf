package com.bogglesmurf.accessibility;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.ColorSpace;
import android.graphics.Path;
import android.graphics.Rect;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;

import com.bogglesmurf.overlay.OverlayService;

import java.io.ByteArrayOutputStream;

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

    /** Callback for the screenshot capture result. base64=null on failure. */
    public interface CaptureResultCallback { void onResult(String base64, String mimeType); }

    /**
     * Take a screenshot of the default display via the accessibility service
     * (API 30+), crop to the given pixel bounds, JPEG-compress, base64-encode,
     * and pass to callback. Callback fires on the main thread.
     */
    public void captureGridArea(Rect bounds, CaptureResultCallback callback) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            callback.onResult(null, null);
            return;
        }
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                @Override
                public void onSuccess(ScreenshotResult screenshot) {
                    String base64 = null;
                    try {
                        HardwareBuffer buf = screenshot.getHardwareBuffer();
                        ColorSpace cs = screenshot.getColorSpace();
                        Bitmap full = Bitmap.wrapHardwareBuffer(buf, cs);
                        if (full == null) throw new RuntimeException("wrapHardwareBuffer returned null");
                        // Clamp crop bounds to bitmap dimensions
                        int x = Math.max(0, Math.min(bounds.left, full.getWidth() - 1));
                        int y = Math.max(0, Math.min(bounds.top, full.getHeight() - 1));
                        int w = Math.min(bounds.width(), full.getWidth() - x);
                        int h = Math.min(bounds.height(), full.getHeight() - y);
                        // Copy out of the hardware buffer into a software bitmap before cropping
                        // (HARDWARE bitmaps don't support getPixels / compress)
                        Bitmap software = full.copy(Bitmap.Config.ARGB_8888, false);
                        full.recycle();
                        if (software == null) throw new RuntimeException("Bitmap copy failed");
                        Bitmap cropped = Bitmap.createBitmap(software, x, y, w, h);
                        software.recycle();
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        cropped.compress(Bitmap.CompressFormat.JPEG, 90, out);
                        cropped.recycle();
                        base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                    } catch (Exception e) {
                        base64 = null;
                    }
                    callback.onResult(base64, "image/jpeg");
                }
                @Override
                public void onFailure(int errorCode) {
                    callback.onResult(null, null);
                }
            });
        } catch (Exception e) {
            callback.onResult(null, null);
        }
    }
}
