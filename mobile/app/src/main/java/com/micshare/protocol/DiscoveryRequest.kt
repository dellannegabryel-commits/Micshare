package com.micshare.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * Requisição de descoberta enviada pelo celular quando o broadcast não chega.
 *
 * Serializada como `{"t":"probe"}` — o PC responde com o beacon em unicast
 * (`packages/pc-ui/src-tauri/src/discovery/beacon.rs`).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("t")
sealed interface DiscoveryRequest {

    /** "probe" — o celular pede a identificação do PC. */
    @Serializable
    @SerialName("probe")
    object Probe : DiscoveryRequest
}
