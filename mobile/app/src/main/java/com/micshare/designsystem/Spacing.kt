package com.micshare.designsystem

import androidx.compose.ui.unit.dp

/**
 * Micshare spacing system - 8dp grid.
 */
object MicshareSpacing {

    private val base = 4.dp

    val None = 0.dp
    val Xxxs = base            // 4dp
    val Xxs = base * 2         // 8dp
    val Xs = base * 3          // 12dp
    val Sm = base * 4          // 16dp
    val Md = base * 5          // 20dp
    val Lg = base * 6          // 24dp
    val Xl = base * 8          // 32dp
    val Xxl = base * 10        // 40dp
    val Xxxl = base * 12       // 48dp
    val Xxxxl = base * 16      // 64dp

    val InlineXs = base        // 4dp
    val InlineSm = base * 2    // 8dp
    val InlineMd = base * 3    // 12dp
    val InlineLg = base * 4    // 16dp

    val StackXs = base * 2     // 8dp
    val StackSm = base * 3     // 12dp
    val StackMd = base * 4     // 16dp
    val StackLg = base * 6     // 24dp
    val StackXl = base * 8     // 32dp

    val ScreenHorizontal = base * 4    // 16dp
    val ScreenVertical = base * 6      // 24dp

    val SectionGap = base * 8          // 32dp
    val GroupGap = base * 6            // 24dp
    val ItemGap = base * 3             // 12dp

    val TouchTargetMin = 48.dp
    val TouchTargetComfortable = 56.dp

    val IconXs = 12.dp
    val IconSm = 16.dp
    val IconMd = 20.dp
    val IconLg = 24.dp
    val IconXl = 28.dp
    val IconXxl = 32.dp
    val IconXxxl = 44.dp

    val AvatarXs = 24.dp
    val AvatarSm = 32.dp
    val AvatarMd = 40.dp
    val AvatarLg = 56.dp
    val AvatarXl = 72.dp
    val AvatarXxl = 100.dp
}