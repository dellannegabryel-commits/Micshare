package com.micshare.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Testes do montador de frames.
 *
 * O carry-over é o que evita o zero-fill no meio do sinal: uma leitura
 * parcial precisa virar o início do frame seguinte, não um buraco de
 * silêncio (clique garantido).
 */
class FrameAssemblerTest {

    @Test
    fun leitura_parcial_nao_insere_silencio() {
        val assembler = FrameAssembler(4)

        // Leitura parcial: só 2 das 4 amostras chegaram.
        assertNull(assembler.write(shortArrayOf(1, 2), 2))

        // A sobra entra no próximo frame — sem zeros no meio.
        val frame = assembler.write(shortArrayOf(3, 4), 2)

        assertArrayEquals(shortArrayOf(1, 2, 3, 4), frame)
    }

    @Test
    fun frame_completo_comeca_o_proximo() {
        val assembler = FrameAssembler(4)

        val frame = assembler.write(shortArrayOf(1, 2, 3, 4), 4)
        assertArrayEquals(shortArrayOf(1, 2, 3, 4), frame)

        // O frame seguinte começa limpo (sem sobra do anterior).
        assertNull(assembler.write(shortArrayOf(5, 6), 2))
        assertArrayEquals(shortArrayOf(5, 6, 7, 8), assembler.write(shortArrayOf(7, 8), 2))
    }
}
