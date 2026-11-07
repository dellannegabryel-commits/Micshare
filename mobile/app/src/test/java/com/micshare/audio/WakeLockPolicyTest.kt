package com.micshare.audio

import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes da política de WakeLock.
 */
class WakeLockPolicyTest {

    @Test
    fun intervalo_de_renovacao_menor_que_o_timeout() {
        assertTrue(
            "renovar depois do timeout deixa o áudio morrer sem erro",
            WakeLockPolicy.RENEWAL_INTERVAL_MS < WakeLockPolicy.LOCK_TIMEOUT_MS,
        )
    }
}
