package com.micshare.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.micshare.ui.theme.Green400
import com.micshare.ui.theme.Green500
import com.micshare.ui.theme.Neutral400
import com.micshare.ui.theme.Neutral500
import com.micshare.ui.theme.Red400
import com.micshare.ui.theme.Red500
import com.micshare.ui.theme.Sky400
import com.micshare.ui.theme.Sky500
import com.micshare.ui.theme.Yellow400
import com.micshare.ui.theme.Yellow500

/** Tom semântico dos pills de status. */
enum class Tone {
    /** Sucesso (verde). */
    Success,

    /** Neutro (cinza). */
    Neutral,

    /** Aviso (amarelo). */
    Warning,

    /** Erro (vermelho). */
    Error,

    /** Informativo (sky). */
    Primary,
}

/**
 * Pill de status — equivalente ao badge circular do `ServerStatus` do app PC.
 */
@Composable
fun StatusPill(
    text: String,
    tone: Tone,
    modifier: Modifier = Modifier,
) {
    val colors = toneColors(tone)

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = colors.container,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(colors.content, CircleShape),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                color = colors.content,
            )
        }
    }
}

/**
 * Pill de métrica — equivalente ao `.stat-pill` do app PC.
 */
@Composable
fun StatPill(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Color? = null,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                color = accent ?: MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Cores (container/conteúdo) de cada tom semântico. */
@Composable
private fun toneColors(tone: Tone): PillColors {
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    return when (tone) {
        Tone.Success -> PillColors(Green500.copy(alpha = 0.16f), if (dark) Green400 else Green500)
        Tone.Neutral -> PillColors(
            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.8f),
            if (dark) Neutral400 else Neutral500,
        )
        Tone.Warning -> PillColors(Yellow500.copy(alpha = 0.16f), if (dark) Yellow400 else Yellow500)
        Tone.Error -> PillColors(Red500.copy(alpha = 0.16f), if (dark) Red400 else Red500)
        Tone.Primary -> PillColors(Sky500.copy(alpha = 0.16f), if (dark) Sky400 else Sky500)
    }
}

/** Par de cores de um pill semântico. */
private data class PillColors(val container: Color, val content: Color)
