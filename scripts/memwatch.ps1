$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$pkg = "com.temurappflowstudios.dexapos"
$interval = 3

$prev = @{}

function ParseKb([string]$line, [string]$pattern) {
  if (-not $line) { return 0 }
  $m = [regex]::Match($line, $pattern)
  if ($m.Success) { return [int64]$m.Groups[1].Value }
  return 0
}

function GetLine($raw, $rx) {
  $match = $raw | Select-String $rx | Select-Object -First 1
  if ($match) { return $match.Line }
  return $null
}

function Read-Meminfo {
  $raw = & $adb shell dumpsys meminfo $pkg 2>$null
  if (-not $raw) { return $null }

  $nHeap   = GetLine $raw '^\s\sNative Heap'
  $dHeap   = GetLine $raw '^\s\sDalvik Heap'
  $stack   = GetLine $raw '^\s{8}Stack'
  $gfxDev  = GetLine $raw '^\s{6}Gfx dev'
  $egl     = GetLine $raw '^\s{3}EGL mtrack'
  $gl      = GetLine $raw '^\s{4}GL mtrack'
  $unknown = GetLine $raw '^\s{6}Unknown'
  $gfxSum  = GetLine $raw 'Graphics:'
  $codeSum = GetLine $raw '^\s*Code:'
  $pssLine = GetLine $raw 'TOTAL PSS:'
  $rssLine = GetLine $raw 'TOTAL RSS:'
  $swapLine = GetLine $raw 'TOTAL SWAP PSS:'

  # Parse numeric columns from the table rows (columns: Pss PDirty PClean Swap Rss Size Alloc Free)
  $nCols = if ($nHeap) { [regex]::Matches($nHeap, '\d+') | % { [int64]$_.Value } } else { @() }
  $dCols = if ($dHeap) { [regex]::Matches($dHeap, '\d+') | % { [int64]$_.Value } } else { @() }

  $nativePss   = if ($nCols.Count -ge 1) { $nCols[0] } else { 0 }
  $nativeSize  = if ($nCols.Count -ge 6) { $nCols[5] } else { 0 }
  $nativeAlloc = if ($nCols.Count -ge 7) { $nCols[6] } else { 0 }
  $dalvikPss   = if ($dCols.Count -ge 1) { $dCols[0] } else { 0 }
  $dalvikSize  = if ($dCols.Count -ge 6) { $dCols[5] } else { 0 }
  $dalvikAlloc = if ($dCols.Count -ge 7) { $dCols[6] } else { 0 }

  $gfxDevKb  = ParseKb $gfxDev  'Gfx dev\s+(\d+)'
  $eglKb     = ParseKb $egl     'EGL mtrack\s+(\d+)'
  $glKb      = ParseKb $gl      'GL mtrack\s+(\d+)'
  $gpuTotal  = $gfxDevKb + $eglKb + $glKb
  $graphicsPss = ParseKb $gfxSum 'Graphics:\s+(\d+)'
  $codeKb    = ParseKb $codeSum 'Code:\s+(\d+)'
  $stackKb   = ParseKb $stack  'Stack\s+(\d+)'
  $unknownKb = ParseKb $unknown 'Unknown\s+(\d+)'

  $totalPss  = ParseKb $pssLine  'TOTAL PSS:\s+(\d+)'
  $totalRss  = ParseKb $rssLine  'TOTAL RSS:\s+(\d+)'
  $totalSwap = ParseKb $swapLine 'TOTAL SWAP PSS:\s+(\d+)'

  # Views line: "Views: NNN    ViewRootImpl: N    AppContexts: N    Activities: N    ... WebViews: N"
  $viewStr = GetLine $raw '^\s*Views:'; if (-not $viewStr) { $viewStr = '' }
  $views       = if ($viewStr -match 'Views:\s+(\d+)')         { [int]$matches[1] } else { 0 }
  $viewRoots   = if ($viewStr -match 'ViewRootImpl:\s+(\d+)')  { [int]$matches[1] } else { 0 }
  $appContexts = if ($viewStr -match 'AppContexts:\s+(\d+)')   { [int]$matches[1] } else { 0 }
  $activities  = if ($viewStr -match 'Activities:\s+(\d+)')    { [int]$matches[1] } else { 0 }
  $webViews    = if ($viewStr -match 'WebViews:\s+(\d+)')      { [int]$matches[1] } else { 0 }

  $binderStr = GetLine $raw 'Local Binders:'; if (-not $binderStr) { $binderStr = '' }
  $localBinders = if ($binderStr -match 'Local Binders:\s+(\d+)')  { [int]$matches[1] } else { 0 }
  $proxyBinders = if ($binderStr -match 'Proxy Binders:\s+(\d+)')  { [int]$matches[1] } else { 0 }

  $sqlMemUsed = ParseKb (GetLine $raw 'MEMORY_USED:') 'MEMORY_USED:\s+(\d+)'
  $pgLine = GetLine $raw 'PAGECACHE_OVERFLOW:'; if (-not $pgLine) { $pgLine = '' }
  $sqlPgCache = if ($pgLine -match 'PAGECACHE_OVERFLOW:\s+(\d+)') { [int]$matches[1] } else { 0 }

  [pscustomobject]@{
    TotalPssKB      = $totalPss
    TotalRssKB      = $totalRss
    TotalSwapKB     = $totalSwap
    NativePss       = $nativePss
    NativeAlloc     = $nativeAlloc
    NativeSize      = $nativeSize
    DalvikPss       = $dalvikPss
    DalvikAlloc     = $dalvikAlloc
    DalvikSize      = $dalvikSize
    GfxDev          = $gfxDevKb
    EGL             = $eglKb
    GL              = $glKb
    GpuTotal        = $gpuTotal
    GraphicsPss     = $graphicsPss
    Code            = $codeKb
    Stack           = $stackKb
    Unknown         = $unknownKb
    Views           = $views
    ViewRoots       = $viewRoots
    AppContexts     = $appContexts
    Activities      = $activities
    WebViews        = $webViews
    LocalBinders    = $localBinders
    ProxyBinders    = $proxyBinders
    SqlMemoryUsed   = $sqlMemUsed
    SqlPageCache    = $sqlPgCache
  }
}

function WriteDelta([string]$label, $current, $prevValue, [string]$unit, [switch]$Inverse) {
  $delta = if ($null -ne $prevValue) { $current - $prevValue } else { 0 }
  $color = "White"
  if ($delta -gt 0) { $color = if ($Inverse) { "Green" } else { "Red" } }
  elseif ($delta -lt 0) { $color = "Green" }
  Write-Host ("  {0,-24} {1,10} {2}   {3,8:+0;-0;0} {2}" -f $label, $current, $unit, $delta) -ForegroundColor $color
}

function ToMB($kb) { [math]::Round($kb / 1024, 1) }

$maxHistory = 30
$history = New-Object System.Collections.ArrayList

while ($true) {
  $s = Read-Meminfo
  if (-not $s) {
    Write-Host "`n[ERROR] Could not read meminfo for $pkg. Is the app running?" -ForegroundColor Red
    Start-Sleep -Seconds $interval
    continue
  }

  $history.Add($s)
  while ($history.Count -gt $maxHistory) { $history.RemoveAt(0) }

  Clear-Host

  Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
  Write-Host "║  Dexa POS Memory Watch                                      ║" -ForegroundColor Cyan
  Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
  Write-Host ("║  Package : {0,-48} ║" -f $pkg) -ForegroundColor DarkGray
  Write-Host ("║  Time    : {0,-48} ║" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor DarkGray
  Write-Host ("║  Samples : {0,-48} ║" -f $history.Count) -ForegroundColor DarkGray
  Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
  Write-Host ""

  Write-Host "── HEAP ─────────────────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "Native PSS"           $s.NativePss       $prev.NativePss       "KB"
  WriteDelta "Native Alloc"         $s.NativeAlloc     $prev.NativeAlloc     "KB"
  WriteDelta "Native Size"          $s.NativeSize      $prev.NativeSize      "KB"
  WriteDelta "Dalvik PSS"           $s.DalvikPss       $prev.DalvikPss       "KB"
  WriteDelta "Dalvik Alloc"         $s.DalvikAlloc     $prev.DalvikAlloc     "KB"
  WriteDelta "Dalvik Size"          $s.DalvikSize      $prev.DalvikSize      "KB"
  Write-Host ""

  Write-Host "── GPU / GRAPHICS ───────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "Gfx dev"              $s.GfxDev          $prev.GfxDev          "KB"
  WriteDelta "EGL mtrack"           $s.EGL             $prev.EGL             "KB"
  WriteDelta "GL mtrack"            $s.GL              $prev.GL              "KB"
  WriteDelta "GPU Total"            $s.GpuTotal        $prev.GpuTotal        "KB"
  WriteDelta "Graphics (summary)"   $s.GraphicsPss     $prev.GraphicsPss     "KB"
  Write-Host ""

  Write-Host "── OTHER ────────────────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "Code"                 $s.Code            $prev.Code            "KB"
  WriteDelta "Stack"                $s.Stack           $prev.Stack           "KB"
  WriteDelta "Unknown"              $s.Unknown         $prev.Unknown         "KB"
  Write-Host ""

  Write-Host "── TOTALS ──────────────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "TOTAL PSS"            $s.TotalPssKB      $prev.TotalPssKB      "KB"
  WriteDelta "TOTAL RSS"            $s.TotalRssKB      $prev.TotalRssKB      "KB"
  WriteDelta "SWAP PSS"             $s.TotalSwapKB     $prev.TotalSwapKB     "KB"

  Write-Host ""
  Write-Host ("  Native: {0,7:N1} MB   Dalvik: {1,7:N1} MB   GPU: {2,7:N1} MB   Graphics: {3,7:N1} MB   PSS: {4,7:N1} MB" -f (ToMB $s.NativePss), (ToMB $s.DalvikPss), (ToMB $s.GpuTotal), (ToMB $s.GraphicsPss), (ToMB $s.TotalPssKB)) -ForegroundColor White
  Write-Host ""

  Write-Host "── VIEWS / OBJECTS ──────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "Views"                $s.Views           $prev.Views           ""  -Inverse
  WriteDelta "ViewRoots"            $s.ViewRoots       $prev.ViewRoots       ""  -Inverse
  WriteDelta "Activities"           $s.Activities      $prev.Activities      ""  -Inverse
  WriteDelta "AppContexts"          $s.AppContexts     $prev.AppContexts     ""  -Inverse
  WriteDelta "WebViews"             $s.WebViews        $prev.WebViews        ""  -Inverse
  WriteDelta "Local Binders"        $s.LocalBinders    $prev.LocalBinders    ""  -Inverse
  WriteDelta "Proxy Binders"        $s.ProxyBinders    $prev.ProxyBinders    ""  -Inverse
  Write-Host ""

  Write-Host "── DATABASE ─────────────────────────────────────────────────" -ForegroundColor Yellow
  WriteDelta "SQL Memory"           $s.SqlMemoryUsed   $prev.SqlMemoryUsed   "KB"
  WriteDelta "SQL PageCache"        $s.SqlPageCache    $prev.SqlPageCache    ""
  Write-Host ""

  Write-Host "── LAST 6 SAMPLES ──────────────────────────────────────────" -ForegroundColor Yellow
  $recent = $history | Select-Object -Last 6
  Write-Host ("  {0,4} {1,7} {2,7} {3,7} {4,7} {5,7} {6,5} {7,5}" -f "", "NatMB", "DalMB", "GpuMB", "GfxMB", "PssMB", "Views", "Rts") -ForegroundColor DarkGray
  Write-Host ("  {0,4} {1,7} {2,7} {3,7} {4,7} {5,7} {6,5} {7,5}" -f "────", "─────", "─────", "─────", "─────", "─────", "─────", "─────") -ForegroundColor DarkGray
  $idx = $recent.Count
  foreach ($entry in $recent) {
    $idx--
    $timeLabel = if ($entry -eq $recent[-1]) { "NOW" } else { "-$idx" }
    Write-Host ("  {0,4} {1,7:N1} {2,7:N1} {3,7:N1} {4,7:N1} {5,7:N1} {6,5} {7,5}" -f $timeLabel, (ToMB $entry.NativePss), (ToMB $entry.DalvikPss), (ToMB $entry.GpuTotal), (ToMB $entry.GraphicsPss), (ToMB $entry.TotalPssKB), $entry.Views, $entry.ViewRoots)
  }
  Write-Host ""

  Write-Host "── Next refresh in $interval s. Ctrl+C to stop. ────────────" -ForegroundColor Yellow

  $prev = $s

  for ($i = $interval; $i -gt 0; $i--) {
    Write-Host "`r  Refreshing in $i...  " -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Seconds 1
  }
}
