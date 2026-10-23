package com.micshare.designsystem

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp

/**
 * Micshare typography system.
 */
object MicshareTypography {

    private val defaultFontFamily = FontFamily.Default

    private fun textStyle(
        fontFamily: FontFamily = defaultFontFamily,
        fontWeight: FontWeight = FontWeight.Normal,
        fontSize: TextUnit,
        lineHeight: TextUnit,
        letterSpacing: TextUnit = 0.sp,
        fontStyle: FontStyle = FontStyle.Normal,
    ): TextStyle {
        return TextStyle(
            fontFamily = fontFamily,
            fontWeight = fontWeight,
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            fontStyle = fontStyle,
        )
    }

    val DisplayLarge = textStyle(fontWeight = FontWeight.Normal, fontSize = 34.sp, lineHeight = 41.sp, letterSpacing = 0.37.sp)
    val DisplayMedium = textStyle(fontWeight = FontWeight.Normal, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = 0.36.sp)
    val DisplaySmall = textStyle(fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.35.sp)

    val HeadlineLarge = textStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.35.sp)
    val HeadlineMedium = textStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 25.sp, letterSpacing = 0.38.sp)
    val HeadlineSmall = textStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 23.sp, letterSpacing = 0.23.sp)

    val TitleLarge = textStyle(fontWeight = FontWeight.Normal, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = 0.36.sp)
    val TitleMedium = textStyle(fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = 0.35.sp)
    val TitleSmall = textStyle(fontWeight = FontWeight.Normal, fontSize = 20.sp, lineHeight = 25.sp, letterSpacing = 0.38.sp)

    val BodyLarge = textStyle(fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.41).sp)
    val BodyMedium = textStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = (-0.24).sp)
    val BodySmall = textStyle(fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp, letterSpacing = (-0.08).sp)

    val LabelLarge = textStyle(fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.41).sp)
    val LabelMedium = textStyle(fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = (-0.24).sp)
    val LabelSmall = textStyle(fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, letterSpacing = (-0.08).sp)

    val ButtonLarge = textStyle(fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 22.sp, letterSpacing = (-0.41).sp)
    val ButtonSmall = textStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp, lineHeight = 20.sp, letterSpacing = (-0.24).sp)

    val MonoLarge = textStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Normal, fontSize = 17.sp, lineHeight = 22.sp)
    val MonoMedium = textStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp)
    val MonoSmall = textStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp)

    fun TextStyle.bold(): TextStyle = copy(fontWeight = FontWeight.Bold)
    fun TextStyle.semibold(): TextStyle = copy(fontWeight = FontWeight.SemiBold)
    fun TextStyle.medium(): TextStyle = copy(fontWeight = FontWeight.Medium)
    fun TextStyle.regular(): TextStyle = copy(fontWeight = FontWeight.Normal)
    fun TextStyle.italic(): TextStyle = copy(fontStyle = FontStyle.Italic)
}