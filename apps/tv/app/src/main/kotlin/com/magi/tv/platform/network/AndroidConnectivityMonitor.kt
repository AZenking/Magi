package com.magi.tv.platform.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import com.magi.tv.domain.repository.ConnectivityMonitor

class AndroidConnectivityMonitor(context: Context) : ConnectivityMonitor {
    private val connectivity = context.applicationContext
        .getSystemService(ConnectivityManager::class.java)

    override fun isOnline(): Boolean {
        val network = connectivity.activeNetwork ?: return false
        val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    override fun observe(listener: () -> Unit): AutoCloseable {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return AutoCloseable { }
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = listener()
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) listener()
            }
        }
        connectivity.registerDefaultNetworkCallback(callback)
        return AutoCloseable { connectivity.unregisterNetworkCallback(callback) }
    }
}
