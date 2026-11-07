package com.micshare.network

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Testes do envio de áudio.
 */
class AudioSenderTest {

    @Test
    fun send_nao_troca_de_contexto() {
        val send = AudioSender::class.java.methods.first { it.name == "send" }

        // Função `suspend` ganha um `Continuation` no bytecode (2 parâmetros)
        // e retorna `Object` — aqui tem que ser uma chamada direta.
        assertEquals(1, send.parameterCount)
        assertEquals(Void.TYPE, send.returnType)
    }
}
