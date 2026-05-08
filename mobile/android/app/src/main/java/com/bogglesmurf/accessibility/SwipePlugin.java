package com.bogglesmurf.accessibility;

import android.content.Intent;
import android.provider.Settings;

import com.bogglesmurf.overlay.OverlayService;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Swipe")
public class SwipePlugin extends Plugin {

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", BoggleAccessibilityService.getInstance() != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void setCalibration(PluginCall call) {
        float gridLeftPct  = call.getDouble("gridLeftPct",  5.0).floatValue();
        float gridTopPct   = call.getDouble("gridTopPct",  28.0).floatValue();
        float gridWidthPct = call.getDouble("gridWidthPct", 90.0).floatValue();
        int   gridSize     = call.getInt("gridSize", 4);
        OverlayService.setCalibration(gridLeftPct, gridTopPct, gridWidthPct, gridSize);
        call.resolve();
    }
}
