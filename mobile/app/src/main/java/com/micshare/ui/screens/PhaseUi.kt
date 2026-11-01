package com.micshare.ui.screens

import com.micshare.ui.components.Tone
import com.micshare.viewmodel.Phase

/** Rótulo legível da fase da sessão. */
internal fun Phase.label(): String = when (this) {
    Phase.Idle -> "Procurando"
    Phase.Connecting -> "Conectando"
    Phase.Connected -> "Conectado"
    Phase.Streaming -> "Transmitindo"
}

/** Tom semântico da fase da sessão. */
internal fun Phase.tone(): Tone = when (this) {
    Phase.Idle -> Tone.Neutral
    Phase.Connecting -> Tone.Warning
    Phase.Connected -> Tone.Primary
    Phase.Streaming -> Tone.Success
}
