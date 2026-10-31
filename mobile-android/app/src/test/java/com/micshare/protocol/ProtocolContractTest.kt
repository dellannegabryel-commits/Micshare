package com.micshare.protocol

import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes de contrato do protocolo Android.
 *
 * Fixam o wire format compartilhado com o servidor Rust
 * (`packages/pc-ui/src-tauri/src/protocol/`): qualquer mudança de um lado
 * quebra estes testes.
 */
class ProtocolContractTest {

    // -------------------------------------------------------------- beacon

    @Test
    fun beacon_parseia_o_json_do_rust() {
        val json = """
            {"app":"micshare","v":1,"name":"PC","audioPort":41235,"ctrlPort":41236,"pair":false,"code":""}
        """.trimIndent()

        val beacon = ProtocolJson.decodeFromString<Beacon>(json)

        assertEquals("micshare", beacon.app)
        assertEquals(1, beacon.v)
        assertEquals("PC", beacon.name)
        assertEquals(41235, beacon.audioPort)
        assertEquals(41236, beacon.ctrlPort)
        assertEquals(false, beacon.pair)
        assertEquals("", beacon.code)
        assertTrue(beacon.isMicshare)
    }

    @Test
    fun beacon_serializa_no_formato_do_rust() {
        val beacon = Beacon(
            app = "micshare",
            v = 1,
            name = "PC",
            audioPort = 41235,
            ctrlPort = 41236,
            pair = false,
            code = "",
        )

        assertEquals(
            """{"app":"micshare","v":1,"name":"PC","audioPort":41235,"ctrlPort":41236,"pair":false,"code":""}""",
            ProtocolJson.encodeToString(Beacon.serializer(), beacon),
        )
    }

    @Test
    fun beacon_de_outra_aplicacao_e_ignorado() {
        val json = """{"app":"outro","v":1,"name":"X","audioPort":1,"ctrlPort":2}"""

        assertTrue(!ProtocolJson.decodeFromString<Beacon>(json).isMicshare)
    }

    @Test
    fun probe_serializa_como_t_probe() {
        assertEquals(
            """{"t":"probe"}""",
            ProtocolJson.encodeToString(DiscoveryRequest.serializer(), DiscoveryRequest.Probe),
        )
    }

    // ------------------------------------------------------------ controle

    @Test
    fun hello_serializa_no_formato_do_rust() {
        val hello = ControlMessage.Hello(
            v = 1,
            token = "",
            sampleRate = 48000,
            channels = 1,
            codec = "pcm16",
            frameMs = 10,
        )

        assertEquals(
            """{"t":"hello","v":1,"token":"","sampleRate":48000,"channels":1,"codec":"pcm16","frameMs":10}""",
            ProtocolJson.encodeToString(ControlMessage.serializer(), hello),
        )
    }

    @Test
    fun welcome_deserializa_o_json_do_rust() {
        val json = """{"t":"welcome","sessionId":"c0001","audioPort":41235,"targetBufferMs":30,"codec":"pcm16"}"""

        val welcome = ProtocolJson.decodeFromString<ControlMessage>(json)

        assertTrue(welcome is ControlMessage.Welcome)
        welcome as ControlMessage.Welcome
        assertEquals("c0001", welcome.sessionId)
        assertEquals(41235, welcome.audioPort)
        assertEquals(30, welcome.targetBufferMs)
        assertEquals("pcm16", welcome.codec)
    }

    @Test
    fun stats_deserializa_o_json_do_rust() {
        val json = """{"t":"stats","lossPct":1.5,"bufferMs":30,"seqGaps":2,"reconnects":0}"""

        val stats = ProtocolJson.decodeFromString<ControlMessage>(json)

        assertTrue(stats is ControlMessage.Stats)
        stats as ControlMessage.Stats
        assertEquals(1.5f, stats.lossPct, 0.001f)
        assertEquals(30, stats.bufferMs)
        assertEquals(2, stats.seqGaps)
        assertEquals(0, stats.reconnects)
    }

    @Test
    fun bye_serializa_sem_campos() {
        assertEquals(
            """{"t":"bye"}""",
            ProtocolJson.encodeToString(ControlMessage.serializer(), ControlMessage.Bye),
        )
    }

    @Test
    fun mute_e_volume_roundtrip() {
        val mute = ProtocolJson.decodeFromString<ControlMessage>("""{"t":"mute","value":true}""")
        assertEquals(ControlMessage.Mute(true), mute)

        val volume = ProtocolJson.decodeFromString<ControlMessage>("""{"t":"volume","value":1.2}""")
        assertEquals(ControlMessage.Volume(1.2f), volume)
    }

    @Test
    fun error_deserializa_codigo_e_mensagem() {
        val json = """{"t":"error","code":"bad_message","message":"mensagem inválida"}"""

        val error = ProtocolJson.decodeFromString<ControlMessage>(json)

        assertTrue(error is ControlMessage.Error)
        error as ControlMessage.Error
        assertEquals("bad_message", error.code)
        assertEquals("mensagem inválida", error.message)
    }

    // ---------------------------------------------------------------- áudio

    @Test
    fun frame_tem_header_de_16_bytes_e_payload_pcm() {
        val pcm = ShortArray(Protocol.FRAME_SAMPLES)

        val datagram = AudioFrame.encode(seq = 7, captureTsMs = 1_000, pcm = pcm)

        assertEquals(AudioFrame.HEADER_LEN + Protocol.FRAME_SAMPLES * 2, datagram.size)
    }

    @Test
    fun header_usa_big_endian_e_payload_little_endian() {
        val pcm = shortArrayOf(1, -1)

        val datagram = AudioFrame.encode(seq = 0, captureTsMs = 0, pcm = pcm)

        // magic "MS" em big-endian
        assertEquals(0x4D, datagram[0].toInt() and 0xFF)
        assertEquals(0x53, datagram[1].toInt() and 0xFF)
        // versão e flags
        assertEquals(AudioFrame.VERSION, datagram[2].toInt() and 0xFF)
        assertEquals(0, datagram[3].toInt() and 0xFF)
        // payload_len big-endian (4 bytes de PCM)
        assertEquals(4, ((datagram[12].toInt() and 0xFF) shl 8) or (datagram[13].toInt() and 0xFF))
        // payload PCM little-endian
        assertEquals(1, datagram[16].toInt() and 0xFF)
        assertEquals(0, datagram[17].toInt() and 0xFF)
        assertEquals(0xFF, datagram[18].toInt() and 0xFF)
        assertEquals(0xFF, datagram[19].toInt() and 0xFF)
    }

    @Test
    fun frame_faz_roundtrip() {
        val pcm = ShortArray(Protocol.FRAME_SAMPLES) { (it % 100).toShort() }

        val decoded = AudioFrame.decode(AudioFrame.encode(seq = 42, captureTsMs = 1_700_000_000, pcm = pcm))

        assertEquals(42, decoded.seq)
        assertEquals(1_700_000_000L, decoded.captureTsMs)
        assertEquals(Protocol.FRAME_SAMPLES * 2, decoded.payloadLen)
        assertEquals(Protocol.CHANNELS, decoded.channels)
        assertEquals(AudioFrame.CODEC_PCM16, decoded.codec)
        assertEquals(0, decoded.flags)
    }

    @Test
    fun frame_mutado_seta_a_flag() {
        val datagram = AudioFrame.encode(
            seq = 1,
            captureTsMs = 0,
            flags = AudioFrame.FLAG_MUTED,
            pcm = ShortArray(Protocol.FRAME_SAMPLES),
        )

        val decoded = AudioFrame.decode(datagram)

        assertEquals(AudioFrame.FLAG_MUTED, decoded.flags)
    }

    @Test
    fun frame_de_10ms_cabe_no_mtu() {
        val datagram = AudioFrame.encode(seq = 0, captureTsMs = 0, pcm = ShortArray(Protocol.FRAME_SAMPLES))

        assertTrue(
            "frame estourou o MTU: ${datagram.size}",
            datagram.size <= 1472,
        )
    }
}
