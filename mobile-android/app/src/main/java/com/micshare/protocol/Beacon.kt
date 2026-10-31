package com.micshare.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Beacon de descoberta emitido pelo PC.
 *
 * Formato (JSON, ≤ 200 B):
 * `{"app":"micshare","v":1,"name":"PC","audioPort":41235,"ctrlPort":41236,"pair":false,"code":""}`
 */
@Serializable
data class Beacon(
    val app: String,
    val v: Int,
    val name: String,
    val audioPort: Int,
    val ctrlPort: Int,
    val pair: Boolean = false,
    val code: String = "",
) {
    /** `true` se o beacon pertence ao Micshare. */
    val isMicshare: Boolean get() = app == "micshare"

    companion object {
        /** Identificador da aplicação. */
        const val APP_ID = "micshare"
    }
}
