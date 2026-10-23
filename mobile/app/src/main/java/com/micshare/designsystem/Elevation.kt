package com.micshare.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.geometry.Offset

/**
 * Micshare elevation/shadow system.
 */
object MicshareElevation {

    data class ShadowToken(
        val ambient: Shadow,
        val spot: Shadow,
    )

    private fun shadow(color: Color, x: Dp, y: Dp, blur: Dp): Shadow {
        return Shadow(color, Offset(x.value, y.value), blur.value)
    }

    val Level0 = ShadowToken(
        ambient = shadow(Color.Transparent, 0.dp, 0.dp, 0.dp),
        spot = shadow(Color.Transparent, 0.dp, 0.dp, 0.dp),
    )

    val Level1 = ShadowToken(
        ambient = shadow(Color(0x1A000000), 0.dp, 1.dp, 2.dp),
        spot = shadow(Color(0x0D000000), 0.dp, 1.dp, 1.dp),
    )

    val Level2 = ShadowToken(
        ambient = shadow(Color(0x1F000000), 0.dp, 2.dp, 4.dp),
        spot = shadow(Color(0x14000000), 0.dp, 2.dp, 2.dp),
    )

    val Level3 = ShadowToken(
        ambient = shadow(Color(0x26000000), 0.dp, 4.dp, 8.dp),
        spot = shadow(Color(0x1A000000), 0.dp, 4.dp, 4.dp),
    )

    val Level4 = ShadowToken(
        ambient = shadow(Color(0x33000000), 0.dp, 8.dp, 16.dp),
        spot = shadow(Color(0x26000000), 0.dp, 8.dp, 8.dp),
    )

    val Level5 = ShadowToken(
        ambient = shadow(Color(0x40000000), 0.dp, 16.dp, 24.dp),
        spot = shadow(Color(0x33000000), 0.dp, 12.dp, 12.dp),
    )

    val Card = Level1
    val CardElevated = Level2
    val CardHovered = Level3
    val Button = Level1
    val ButtonPressed = Level0
    val FAB = Level3
    val FABPressed = Level2
    val Sheet = Level4
    val Modal = Level5
    val Popover = Level3
    val Tooltip = Level2
    val NavigationBar = Level2
    val AppBar = Level1

    fun ShadowToken.toCombined(): Shadow {
        return if (spot.blurRadius > ambient.blurRadius) spot else ambient
    }
}