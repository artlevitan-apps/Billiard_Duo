package com.gevork.billiardinsky;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;

public class MainActivity extends Activity {
    private WebView game;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(5894 | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(7, 21, 14));
        game.setFocusable(true);
        game.setFocusableInTouchMode(true);
        game.setWebViewClient(new WebViewClient());
        WebSettings s = game.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDefaultTextEncodingName("UTF-8");
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        setContentView(game);
        game.loadUrl("file:///android_asset/index.html");
        game.requestFocus();
    }
    private String mapped(int k) {
        switch(k) {
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return "Enter";
            case KeyEvent.KEYCODE_BACK: return "Escape";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
            default: return null;
        }
    }
    private boolean sendKey(KeyEvent event, boolean down) {
        String key = mapped(event.getKeyCode());
        if(key == null) return false;
        boolean repeat = event.getRepeatCount() > 0;
        String js = "window.dispatchEvent(new KeyboardEvent('" + (down ? "keydown" : "keyup") + "', {key:'" + key + "',code:'" + key + "',bubbles:true,cancelable:true,repeat:" + repeat + "}));";
        game.evaluateJavascript(js, null);
        return true;
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if(event.getAction() == KeyEvent.ACTION_DOWN && sendKey(event,true)) return true;
        if(event.getAction() == KeyEvent.ACTION_UP && sendKey(event,false)) return true;
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onPause() {
        if(game!=null) game.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
        super.onPause();
    }
    @Override protected void onDestroy() { if(game!=null) {game.destroy();game=null;} super.onDestroy(); }
}
