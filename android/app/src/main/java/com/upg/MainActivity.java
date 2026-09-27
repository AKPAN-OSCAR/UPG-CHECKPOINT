package com.upg;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpgAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
