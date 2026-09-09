param([string]$Root = 'H:\AI-стилист\benchmark-data\privacy-person-presence-poc')
Add-Type -AssemblyName System.Drawing
$out = Join-Path $Root 'images'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function Save-Fixture([string]$name, [scriptblock]$draw) {
  $bmp = [Drawing.Bitmap]::new(640, 480)
  $g = [Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([Drawing.Color]::FromArgb(236, 232, 222))
    & $draw $g
    $bmp.Save((Join-Path $out $name), [Drawing.Imaging.ImageFormat]::Png)
  } finally { $g.Dispose(); $bmp.Dispose() }
}
function Draw-Person($g, [int]$x, [int]$y, [double]$scale, [Drawing.Color]$color) {
  $b=[Drawing.SolidBrush]::new($color); $p=[Drawing.Pen]::new($color,[single](18*$scale))
  try {
    $g.FillEllipse($b,$x,$y,[int](58*$scale),[int](58*$scale))
    $g.DrawLine($p,$x+[int](29*$scale),$y+[int](60*$scale),$x+[int](29*$scale),$y+[int](210*$scale))
    $g.DrawLine($p,$x+[int](29*$scale),$y+[int](95*$scale),$x-[int](35*$scale),$y+[int](155*$scale))
    $g.DrawLine($p,$x+[int](29*$scale),$y+[int](95*$scale),$x+[int](93*$scale),$y+[int](155*$scale))
    $g.DrawLine($p,$x+[int](29*$scale),$y+[int](205*$scale),$x-[int](25*$scale),$y+[int](300*$scale))
    $g.DrawLine($p,$x+[int](29*$scale),$y+[int](205*$scale),$x+[int](83*$scale),$y+[int](300*$scale))
  } finally { $b.Dispose(); $p.Dispose() }
}
function Draw-Rack($g) {
  $pen=[Drawing.Pen]::new([Drawing.Color]::FromArgb(70,70,70),8); $colors=@([Drawing.Color]::DarkRed,[Drawing.Color]::Navy,[Drawing.Color]::DarkGreen,[Drawing.Color]::Goldenrod)
  try {
    $g.DrawLine($pen,80,80,560,80); $g.DrawLine($pen,100,80,100,430); $g.DrawLine($pen,540,80,540,430)
    for($i=0;$i -lt 8;$i++){ $b=[Drawing.SolidBrush]::new($colors[$i%4]); try{$g.FillRectangle($b,125+$i*48,120,40,245)}finally{$b.Dispose()} }
  } finally {$pen.Dispose()}
}
Save-Fixture 'synthetic-no-person-rack.png' { param($g) Draw-Rack $g }
Save-Fixture 'synthetic-one-full.png' { param($g) Draw-Person $g 285 70 1.0 ([Drawing.Color]::FromArgb(36,76,126)) }
Save-Fixture 'synthetic-one-small.png' { param($g) Draw-Person $g 500 250 0.45 ([Drawing.Color]::FromArgb(36,76,126)) }
Save-Fixture 'synthetic-one-partial.png' { param($g) Draw-Person $g -20 20 1.55 ([Drawing.Color]::FromArgb(36,76,126)) }
Save-Fixture 'synthetic-one-occluded.png' { param($g) Draw-Person $g 280 60 1.0 ([Drawing.Color]::FromArgb(36,76,126)); $b=[Drawing.SolidBrush]::new([Drawing.Color]::DarkGray);try{$g.FillRectangle($b,250,170,180,190)}finally{$b.Dispose()} }
Save-Fixture 'synthetic-two-overlap.png' { param($g) Draw-Person $g 220 80 1.0 ([Drawing.Color]::DarkRed); Draw-Person $g 300 90 1.0 ([Drawing.Color]::Navy) }
Save-Fixture 'synthetic-three-small.png' { param($g) Draw-Person $g 100 220 .55 ([Drawing.Color]::DarkRed); Draw-Person $g 285 215 .55 ([Drawing.Color]::Navy); Draw-Person $g 470 225 .55 ([Drawing.Color]::DarkGreen) }
Save-Fixture 'synthetic-mannequin.png' { param($g) $b=[Drawing.SolidBrush]::new([Drawing.Color]::Beige);$p=[Drawing.Pen]::new([Drawing.Color]::Gray,6);try{$g.FillEllipse($b,285,45,70,70);$g.FillPolygon($b,@([Drawing.Point]::new(250,130),[Drawing.Point]::new(390,130),[Drawing.Point]::new(365,340),[Drawing.Point]::new(275,340)));$g.DrawLine($p,320,340,320,430);$g.DrawLine($p,250,430,390,430)}finally{$b.Dispose();$p.Dispose()} }
Save-Fixture 'synthetic-poster-person.png' { param($g) $p=[Drawing.Pen]::new([Drawing.Color]::Black,12);try{$g.DrawRectangle($p,150,30,340,420);Draw-Person $g 285 85 .9 ([Drawing.Color]::DarkSlateBlue)}finally{$p.Dispose()} }
Save-Fixture 'synthetic-reflection-person.png' { param($g) $p=[Drawing.Pen]::new([Drawing.Color]::Silver,14);try{$g.DrawRectangle($p,170,25,300,430);Draw-Person $g 285 80 .9 ([Drawing.Color]::FromArgb(110,90,120,150))}finally{$p.Dispose()} }
Save-Fixture 'synthetic-mixed-garment-one.png' { param($g) Draw-Rack $g; Draw-Person $g 400 105 .9 ([Drawing.Color]::FromArgb(36,76,126)) }

$src = Join-Path $Root 'source\moon-astronaut.png'
if (Test-Path $src) {
  $img=[Drawing.Image]::FromFile($src)
  try {
    foreach($spec in @(@('public-moon-astronaut.png',[Drawing.Rectangle]::new(0,0,600,600)),@('public-moon-astronaut-partial.png',[Drawing.Rectangle]::new(120,30,350,500)))) {
      $bmp=[Drawing.Bitmap]::new(640,480);$g=[Drawing.Graphics]::FromImage($bmp)
      try{$g.Clear([Drawing.Color]::Black);$g.DrawImage($img,[Drawing.Rectangle]::new(0,0,640,480),$spec[1],[Drawing.GraphicsUnit]::Pixel);$bmp.Save((Join-Path $out $spec[0]),[Drawing.Imaging.ImageFormat]::Png)}finally{$g.Dispose();$bmp.Dispose()}
    }
  } finally {$img.Dispose()}
}
