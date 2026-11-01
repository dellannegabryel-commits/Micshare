package com.micshare.protocol

import kotlinx.serialization.json.Json

/**
 * Instância de [Json] usada em todo o protocolo.
 *
 * - `ignoreUnknownKeys`: o PC pode evoluir o wire format sem quebrar o app.
 * - `classDiscriminator`: "t", igual ao `serde(tag = "t")` do servidor Rust.
 */
val ProtocolJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    classDiscriminator = "t"
}
