package com.micshare.audio

import com.micshare.protocol.Protocol

/**
 * Estado do streaming de áudio, publicado pelo [AudioCaptureService].
 *
 * @property active `true` enquanto o serviço transmite.
 * @property framesSent frames enviados desde o início do streaming.
 * @property bytesSent bytes enviados desde o início do streaming.
 * @property muted `true` quando o microfone está mutado.
 * @property error última falha ocorrência (ou `null`).
 */
data class StreamingStatus(
    val active: Boolean = false,
    val framesSent: Long = 0,
    val bytesSent: Long = 0,
    val sampleRate: Int = Protocol.SAMPLE_RATE,
    val muted: Boolean = false,
    val error: String? = null,
)
