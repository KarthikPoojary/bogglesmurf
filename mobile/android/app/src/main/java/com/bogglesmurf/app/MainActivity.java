package com.bogglesmurf.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.bogglesmurf.overlay.OverlayPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OverlayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
