package com.micshare.designsystem

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Micshare shape system.
 */
object MicshareShapes {

    val None = RoundedCornerShape(0.dp)
    val Xs = RoundedCornerShape(4.dp)
    val Sm = RoundedCornerShape(8.dp)
    val Md = RoundedCornerShape(12.dp)
    val Lg = RoundedCornerShape(16.dp)
    val Xl = RoundedCornerShape(20.dp)
    val Xxl = RoundedCornerShape(24.dp)
    val Xxxl = RoundedCornerShape(28.dp)
    val Full = RoundedCornerShape(9999.dp)

    val Button = Md
    val ButtonLarge = Lg
    val Card = Xl
    val CardLarge = Xxl
    val Sheet = Xxxl
    val Input = Md
    val Chip = Full
    val Avatar = Full
    val FAB = Full
    val Tooltip = Sm
    val Popover = Md

    val ListItemTop = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 0.dp, bottomEnd = 0.dp)
    val ListItemBottom = RoundedCornerShape(topStart = 0.dp, topEnd = 0.dp, bottomStart = 16.dp, bottomEnd = 16.dp)
    val ListItemSingle = Lg
    val ListItemMiddle = None
}