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

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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
            call.reject("SYSTEM_ALERT_WINDOW permission not granted");
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

    /**
     * words: [{ word: "CAT", path: [0,0,0,1,0,2], isCommon: true }, ...]
     * commonWords: ["CAT", "DOG", ...] (same list, used to populate commonWordSet)
     */
    @PluginMethod
    public void setWords(PluginCall call) {
        JSArray wordsJson  = call.getArray("words");
        JSArray commonJson = call.getArray("commonWords");
        if (wordsJson == null) { call.reject("words parameter is required"); return; }

        Set<String> commonSet = new HashSet<>();
        if (commonJson != null) {
            try {
                for (int i = 0; i < commonJson.length(); i++) commonSet.add(commonJson.getString(i));
            } catch (JSONException e) { /* ignore */ }
        }

        List<OverlayService.WordEntry> entries = new ArrayList<>();
        try {
            for (int i = 0; i < wordsJson.length(); i++) {
                JSONObject obj = wordsJson.getJSONObject(i);
                String word = obj.getString("word");

                // path is a flat int array [row0,col0,row1,col1,...]
                JSONArray pathJson = obj.getJSONArray("path");
                int[] path = new int[pathJson.length()];
                for (int j = 0; j < pathJson.length(); j++) path[j] = pathJson.getInt(j);

                boolean isCommon = commonSet.contains(word);
                entries.add(new OverlayService.WordEntry(word, path, isCommon));
            }
        } catch (JSONException e) {
            call.reject("Invalid words array: " + e.getMessage());
            return;
        }
        OverlayService.setWords(entries, commonSet);
        call.resolve();
    }

    @PluginMethod
    public void setAlpha(PluginCall call) {
        Double alpha = call.getDouble("alpha");
        if (alpha == null) { call.reject("alpha parameter is required"); return; }
        OverlayService.setAlpha(alpha.floatValue());
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
