package com.upg

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/*
 * UpgAlarmPlugin — the native half of the alarm system.
 *
 * IMPORTANT, stated plainly: this file has been written to compile
 * against Capacitor 8's plugin API and standard Android SDK calls,
 * but it has NOT been compiled or run on a device — there is no
 * Android SDK/Gradle toolchain available in the environment this was
 * written in (same limitation as the earlier Gradle/Android Studio
 * work). It needs a real build + device test in Android Studio before
 * being trusted as "done." Treat this as a strong first draft, not a
 * verified-working binary.
 *
 * What each method actually does, and why:
 *
 * getDeviceAlarmSounds() — queries RingtoneManager for TYPE_ALARM,
 *   which returns exactly the alarm-sound list the phone's own Clock
 *   app would show. This is a standard, unrestricted Android API —
 *   no special permission needed.
 *
 * playAlarmSound(uri, volume) — plays a device alarm-sound URI (from
 *   getDeviceAlarmSounds()) through STREAM_ALARM specifically — the
 *   dedicated alarm audio channel that stays audible even when
 *   media/ringer volume is turned down.
 *
 * playUpgTone(toneName, volume) — plays one of UPG's own 12 bundled
 *   tones (res/raw/*.wav, generated to match the 12 patterns defined
 *   in src/core/alarm-tones.js) through that SAME STREAM_ALARM path —
 *   this is what makes UPG's own sounds just as loud and reliable as
 *   picking a device sound, not a weaker in-app-only fallback.
 *
 * boostAlarmVolume() — sets STREAM_ALARM to its maximum value. This
 *   is the honest, physically-real version of "as loud as possible":
 *   it cannot exceed the hardware's actual maximum output, but it
 *   guarantees the alarm isn't quietly capped by whatever volume the
 *   user last left the stream at.
 *
 * requestDndBypass() — Do Not Disturb bypass is NOT something an app
 *   can silently grant itself; Android requires the user to explicitly
 *   flip it on in system settings. This method opens that exact
 *   settings screen — it can't complete the grant for them, only get
 *   them to the right place.
 */
@CapacitorPlugin(name = "UpgAlarm")
class UpgAlarmPlugin : Plugin() {

    private var activePlayer: MediaPlayer? = null
    private var activeRingtone: Ringtone? = null

    @PluginMethod
    fun getDeviceAlarmSounds(call: PluginCall) {
        try {
            val manager = RingtoneManager(context)
            manager.setType(RingtoneManager.TYPE_ALARM)
            val cursor = manager.cursor
            val results = JSArray()

            while (cursor.moveToNext()) {
                val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX)
                val uri = manager.getRingtoneUri(cursor.position).toString()
                val entry = JSObject()
                entry.put("title", title)
                entry.put("uri", uri)
                results.put(entry)
            }

            val ret = JSObject()
            ret.put("sounds", results)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Could not read device alarm sounds: ${e.message}", e)
        }
    }

    @PluginMethod
    fun playAlarmSound(call: PluginCall) {
        val uriString = call.getString("uri")
        val volume = (call.getFloat("volume") ?: 0.9f).coerceIn(0f, 1f)

        if (uriString == null) {
            call.reject("Missing 'uri'")
            return
        }

        try {
            stopInternal()
            val uri = Uri.parse(uriString)
            val player = MediaPlayer()
            player.setAudioStreamType(AudioManager.STREAM_ALARM) // the actual "alarm channel" — the whole point of this method
            player.setDataSource(context, uri)
            player.setVolume(volume, volume)
            player.isLooping = true
            player.prepare()
            player.start()
            activePlayer = player
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not play alarm sound: ${e.message}", e)
        }
    }

    // Plays one of UPG's own 12 bundled tones (res/raw/*.wav) through
    // the SAME STREAM_ALARM path as device sounds — this is what makes
    // "choose UPG's own sound" just as loud/reliable as "choose a
    // device sound," instead of a weaker in-app-only fallback.
    @PluginMethod
    fun playUpgTone(call: PluginCall) {
        val toneName = call.getString("toneName")
        val volume = (call.getFloat("volume") ?: 0.9f).coerceIn(0f, 1f)

        if (toneName == null) {
            call.reject("Missing 'toneName'")
            return
        }

        try {
            val resId = context.resources.getIdentifier(toneName, "raw", context.packageName)
            if (resId == 0) {
                call.reject("Unknown UPG tone: $toneName")
                return
            }
            stopInternal()
            val uri = Uri.parse("android.resource://${context.packageName}/$resId")
            val player = MediaPlayer()
            player.setAudioStreamType(AudioManager.STREAM_ALARM)
            player.setDataSource(context, uri)
            player.setVolume(volume, volume)
            player.isLooping = true
            player.prepare()
            player.start()
            activePlayer = player
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not play UPG tone: ${e.message}", e)
        }
    }

    @PluginMethod
    fun stopAlarmSound(call: PluginCall) {
        stopInternal()
        call.resolve()
    }

    private fun stopInternal() {
        activePlayer?.let { try { it.stop(); it.release() } catch (e: Exception) {} }
        activePlayer = null
        activeRingtone?.let { try { it.stop() } catch (e: Exception) {} }
        activeRingtone = null
    }

    @PluginMethod
    fun boostAlarmVolume(call: PluginCall) {
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            am.setStreamVolume(AudioManager.STREAM_ALARM, max, 0)
            val ret = JSObject()
            ret.put("maxVolume", max)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Could not boost alarm volume: ${e.message}", e)
        }
    }

    @PluginMethod
    fun isDndBypassGranted(call: PluginCall) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) nm.isNotificationPolicyAccessGranted else true
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestDndBypass(call: PluginCall) {
        // Cannot be silently granted — this opens the exact system
        // settings screen where the user must flip it on themselves.
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not open DND settings: ${e.message}", e)
        }
    }
}
