package com.bogglesmurf.overlay;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import java.util.ArrayList;

@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Settings.canDrawOverlays(getContext())) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        saveCall(call);
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        startActivityForResult(call, intent, "onPermissionResult");
    }

    @ActivityCallback
    private void onPermissionResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        ret.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("SYSTEM_ALERT_WINDOW permission not granted — call requestPermission() first");
            return;
        }
        startService(OverlayService.ACTION_SHOW);
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        startService(OverlayService.ACTION_HIDE);
        call.resolve();
    }

    @PluginMethod
    public void setWords(PluginCall call) {
        JSArray wordsJson = call.getArray("words");
        if (wordsJson == null) {
            call.reject("words parameter is required");
            return;
        }
        ArrayList<String> words = new ArrayList<>();
        try {
            for (int i = 0; i < wordsJson.length(); i++) {
                words.add(wordsJson.getString(i));
            }
        } catch (JSONException e) {
            call.reject("Invalid words array: " + e.getMessage());
            return;
        }
        OverlayService.setWords(words);
        call.resolve();
    }

    private void startService(String action) {
        Intent intent = new Intent(getContext(), OverlayService.class);
        intent.setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
