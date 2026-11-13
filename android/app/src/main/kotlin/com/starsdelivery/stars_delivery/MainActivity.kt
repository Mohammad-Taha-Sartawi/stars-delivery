package com.starsdelivery.stars_delivery

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createOrderNotificationChannel()
    }

    /**
     * The server sends order pushes on the `stars_delivery_default` channel
     * (also the default channel in AndroidManifest.xml). Android drops a
     * channel's settings to the generic "Miscellaneous" fallback when the app
     * never created it, so create it with high importance: order updates then
     * pop up as heads-up notifications, including when the app is closed.
     * Creating an existing channel is a no-op.
     */
    private fun createOrderNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            ORDER_CHANNEL_ID,
            getString(R.string.order_notifications_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.order_notifications_channel_description)
            enableVibration(true)
        }
        getSystemService(NotificationManager::class.java)
            ?.createNotificationChannel(channel)
    }

    companion object {
        const val ORDER_CHANNEL_ID = "stars_delivery_default"
    }
}
