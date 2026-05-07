package com.bogglesmurf.overlay;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;
import java.util.ArrayList;

@CapacitorPlugin(
    name = "Overlay",
    permissions = {
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(ret);
    }

    // Opens the system "Display over other apps" settings screen.
    // Resolves immediately with the current state — caller re-checks hasPermission()
    // after the user returns from Settings (UX identical to Messenger / TrueCaller).
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Settings.canDrawOverlays(getContext())) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        getContext().startActivity(intent);
        JSObject ret = new JSObject();
        ret.put("granted", false);
        call.resolve(ret);
    }

    // Requests POST_NOTIFICATIONS at runtime (required on Android 13+ for the foreground
    // service notification that keeps the overlay alive). No-op below API 33.
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
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
