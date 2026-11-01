package com.micshare.network

/**
 * PC descoberto na rede local.
 *
 * @param host endereço IPv4 do PC (origem do datagrama do beacon).
 * @param name hostname anunciado pelo PC.
 * @param ctrlPort porta WebSocket de controle.
 * @param audioPort porta UDP de áudio.
 * @param pair `true` se o PC exige código de pareamento.
 * @param code código de pareamento (vazio quando `pair` é `false`).
 * @param lastSeenMillis instante da última recepção do beacon.
 */
data class DiscoveredServer(
    val host: String,
    val name: String,
    val ctrlPort: Int,
    val audioPort: Int,
    val pair: Boolean,
    val code: String,
    val lastSeenMillis: Long,
)
