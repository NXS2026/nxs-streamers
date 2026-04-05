$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF]$Rect,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$iconsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseSize = 512

$bmp = New-Object System.Drawing.Bitmap $baseSize, $baseSize
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bgRect = New-Object System.Drawing.Rectangle 0, 0, $baseSize, $baseSize
$bgTop = [System.Drawing.ColorTranslator]::FromHtml('#0a0f1f')
$bgBottom = [System.Drawing.ColorTranslator]::FromHtml('#061018')
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, $bgTop, $bgBottom, 45
$g.FillRectangle($bgBrush, $bgRect)

$glassRect = New-Object System.Drawing.RectangleF 28, 28, 456, 456
$glassPath = New-RoundedRectanglePath -Rect $glassRect -Radius 96
$glassBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Rectangle]::Round($glassRect)), ([System.Drawing.Color]::FromArgb(235, 14, 22, 34)), ([System.Drawing.Color]::FromArgb(235, 10, 16, 25)), 90
$g.FillPath($glassBrush, $glassPath)

$stripeBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 83, 252, 24))
$stripePoints = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(30, 360),
  [System.Drawing.PointF]::new(310, 30),
  [System.Drawing.PointF]::new(470, 30),
  [System.Drawing.PointF]::new(190, 470)
)
$g.FillPolygon($stripeBrush, $stripePoints)

$center = [System.Drawing.PointF]::new($baseSize / 2, $baseSize / 2)
$neon = [System.Drawing.ColorTranslator]::FromHtml('#53fc18')

for ($i = 0; $i -lt 6; $i++) {
  $glowSize = 320 + ($i * 18)
  $alpha = [Math]::Max(10, 54 - ($i * 8))
  $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, $neon))
  $glowRect = New-Object System.Drawing.RectangleF ($center.X - ($glowSize / 2)), ($center.Y - ($glowSize / 2)), $glowSize, $glowSize
  $g.FillEllipse($glowBrush, $glowRect)
  $glowBrush.Dispose()
}

$coreRect = New-Object System.Drawing.RectangleF 108, 108, 296, 296
$coreBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Rectangle]::Round($coreRect)), ([System.Drawing.Color]::FromArgb(255, 8, 12, 18)), ([System.Drawing.Color]::FromArgb(255, 15, 24, 34)), 90
$g.FillEllipse($coreBrush, $coreRect)

$ringPen = New-Object System.Drawing.Pen $neon, 16
$ringPen.Alignment = [System.Drawing.Drawing2D.PenAlignment]::Center
$g.DrawEllipse($ringPen, $coreRect)

$innerPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 255, 255, 255)), 2
$g.DrawEllipse($innerPen, 126, 126, 260, 260)

$font = New-Object System.Drawing.Font 'Segoe UI', 148, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
$textBrush = New-Object System.Drawing.SolidBrush $neon
$textRect = New-Object System.Drawing.RectangleF 70, 138, 372, 220
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center

$shadowRect = New-Object System.Drawing.RectangleF ($textRect.X + 4), ($textRect.Y + 6), $textRect.Width, $textRect.Height
$g.DrawString('AK', $font, $shadowBrush, $shadowRect, $format)
$g.DrawString('AK', $font, $textBrush, $textRect, $format)

$barBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 83, 252, 24))
$g.FillRectangle($barBrush, 152, 352, 208, 12)
$g.FillRectangle($barBrush, 176, 380, 160, 8)

$sizes = @(16, 48, 128, 256)

foreach ($size in $sizes) {
  $scaled = New-Object System.Drawing.Bitmap $size, $size
  $sg = [System.Drawing.Graphics]::FromImage($scaled)
  $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $sg.DrawImage($bmp, 0, 0, $size, $size)

  $target = Join-Path $iconsDir "icon-$size.png"
  $scaled.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

  if ($size -eq 128) {
    $scaled.Save((Join-Path $iconsDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }

  $sg.Dispose()
  $scaled.Dispose()
}

$format.Dispose()
$barBrush.Dispose()
$textBrush.Dispose()
$shadowBrush.Dispose()
$font.Dispose()
$innerPen.Dispose()
$ringPen.Dispose()
$coreBrush.Dispose()
$stripeBrush.Dispose()
$glassBrush.Dispose()
$glassPath.Dispose()
$bgBrush.Dispose()
$g.Dispose()
$bmp.Dispose()
