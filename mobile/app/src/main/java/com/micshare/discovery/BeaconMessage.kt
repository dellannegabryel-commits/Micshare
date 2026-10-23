package com.micshare.discovery

import kotlinx.serialization.Serializable

@Serializable
data class BeaconMessage(
    val app: String,
    val v: Int,
    val name: String,
    val audioPort: Int,
    val ctrlPort: Int,
    val pair: Boolean,
    val code: String
)

data class PCInfo(
    val name: String,
    val ip: String,
    val audioPort: Int,
    val ctrlPort: Int,
    val pair: Boolean,
    val code: String,
    val lastSeen: Long = System.currentTimeMillis()
)