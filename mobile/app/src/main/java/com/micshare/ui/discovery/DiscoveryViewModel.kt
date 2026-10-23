package com.micshare.ui.discovery

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.micshare.discovery.BeaconListener
import com.micshare.discovery.PCInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class DiscoveryViewModel(private val beaconListener: BeaconListener) : ViewModel() {
    private val _pcs = MutableStateFlow<List<PCInfo>>(emptyList())
    val pcs = _pcs.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing = _refreshing.asStateFlow()

    private var unsubscribe: (() -> Unit)? = null

    init {
        unsubscribe = beaconListener.subscribe { list ->
            _pcs.value = list
        }
        beaconListener.start()
        beaconListener.pingBroadcast()
    }

    fun refresh() {
        _refreshing.value = true
        beaconListener.pingBroadcast()
        _pcs.value = beaconListener.getPCs()
        viewModelScope.launch {
            kotlinx.coroutines.delay(600)
            _refreshing.value = false
        }
    }

    fun manualConnect(ip: String, port: Int): PCInfo {
        return PCInfo(
            name = if (ip.contains(".")) "PC (${ip.takeLast(6)})" else "PC Manual",
            ip = ip,
            audioPort = 41235,
            ctrlPort = port,
            pair = true,
            code = "",
            lastSeen = System.currentTimeMillis()
        )
    }

    override fun onCleared() {
        unsubscribe?.invoke()
        unsubscribe = null
        beaconListener.stop()
        super.onCleared()
    }
}