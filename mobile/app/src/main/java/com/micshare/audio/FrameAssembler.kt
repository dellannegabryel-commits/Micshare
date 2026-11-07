package com.micshare.audio

/**
 * Monta frames de tamanho fixo a partir de leituras parciais do `AudioRecord`.
 *
 * Uma leitura pode devolver menos amostras do que o pedido (o SO entrega o
 * que já tem no FIFO). A sobra **não** vira silêncio: fica como carry e o
 * próximo frame continua de onde parou. Todo frame emitido tem exatamente
 * [frameSamples] amostras reais — zero no meio do sinal é clique garantido.
 *
 * Classe pura (sem Android): testável em JVM.
 */
class FrameAssembler(private val frameSamples: Int) {

    /** Buffer onde o frame é montado (reaproveitado). */
    private val buffer = ShortArray(frameSamples)

    /** Quantas amostras do buffer já são reais. */
    private var filled = 0

    /** Espaço livre (em amostras) para a próxima leitura. */
    val space: Int get() = frameSamples - filled

    /**
     * Acrescenta [count] amostras de [samples] e devolve o frame completo
     * quando o buffer encheu, ou `null` se ainda falta amostra.
     *
     * @throws IllegalArgumentException se [count] não couber no espaço livre.
     */
    fun write(samples: ShortArray, count: Int): ShortArray? {
        require(count in 0..space) { "leitura de $count amostras maior que o espaço livre ($space)" }
        System.arraycopy(samples, 0, buffer, filled, count)
        filled += count
        if (filled < frameSamples) return null

        val frame = buffer.copyOf()
        filled = 0
        return frame
    }
}
