export const SMTC_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
} | Select-Object -First 1

function Await($op, [Type]$type) {
    $task = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    return $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.MediaPlaybackAutoRepeatMode, Windows.Media, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$pendingLine = $stdin.ReadLineAsync()

$selected = 'auto'
$lastJson = ''
$lastThumbKey = ''
$thumbRetryAt = $null

function Get-Session {
    $sessions = @($mgr.GetSessions())
    if ($selected -ne 'auto') {
        $s = $sessions | Where-Object { $_.SourceAppUserModelId -eq $selected } | Select-Object -First 1
        if ($s) { return $s }
    }
    $cur = $mgr.GetCurrentSession()
    if ($cur) { return $cur }
    return $sessions | Select-Object -First 1
}

function Send-Thumb($props, $key) {
    $data = $null
    $mime = $null
    try {
        if ($props.Thumbnail) {
            $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
            try { $mime = ([Windows.Storage.Streams.IContentTypeProvider].GetProperty('ContentType').GetValue($stream) -split ',')[0] } catch { }
            $net = $asStreamForRead.Invoke($null, @($stream))
            $ms = New-Object System.IO.MemoryStream
            $net.CopyTo($ms)
            $data = [Convert]::ToBase64String($ms.ToArray())
            $net.Dispose()
            $ms.Dispose()
        }
    } catch { }
    if (-not $mime) { $mime = 'image/png' }
    $msg = @{ type = 'thumb'; key = $key; mime = $mime; data = $data } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($msg)
    [Console]::Out.Flush()
}

function Invoke-Cmd($line, $s) {
    $parts = $line.Trim() -split ' ', 2
    $arg = if ($parts.Count -gt 1) { $parts[1] } else { '' }
    if ($parts[0] -eq 'select') { $script:selected = $arg; $script:lastJson = ''; return }
    if (-not $s) { return }
    $op = switch ($parts[0]) {
        'toggle'  { $s.TryTogglePlayPauseAsync() }
        'play'    { $s.TryPlayAsync() }
        'pause'   { $s.TryPauseAsync() }
        'next'    { $s.TrySkipNextAsync() }
        'prev'    { $s.TrySkipPreviousAsync() }
        'seek'    { $s.TryChangePlaybackPositionAsync([long]([double]$arg * 10000)) }
        'shuffle' { $s.TryChangeShuffleActiveAsync($arg -eq 'true') }
        'repeat'  {
            $mode = switch ($arg) { 'track' { [Windows.Media.MediaPlaybackAutoRepeatMode]::Track } 'list' { [Windows.Media.MediaPlaybackAutoRepeatMode]::List } default { [Windows.Media.MediaPlaybackAutoRepeatMode]::None } }
            $s.TryChangeAutoRepeatModeAsync($mode)
        }
        default { $null }
    }
    if ($op) { $null = Await $op ([bool]) }
}

while ($true) {
    $s = $null
    try { $s = Get-Session } catch { }

    while ($pendingLine.IsCompleted) {
        $line = $pendingLine.Result
        if ($null -eq $line) { exit 0 }
        try { Invoke-Cmd $line $s } catch { }
        $pendingLine = $stdin.ReadLineAsync()
    }

    $state = @{ type = 'state'; active = $false; sessions = @(); selected = $selected }
    try {
        $state.sessions = @($mgr.GetSessions() | ForEach-Object { $_.SourceAppUserModelId })
        if ($s) {
            $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            $tl = $s.GetTimelineProperties()
            $pb = $s.GetPlaybackInfo()
            $c = $pb.Controls
            $repeat = $null
            if ($null -ne $pb.AutoRepeatMode) { $repeat = $pb.AutoRepeatMode.ToString().ToLower() }
            $thumbKey = $s.SourceAppUserModelId + '|' + $props.Title + '|' + $props.Artist + '|' + $props.AlbumTitle

            $state.active = $true
            $state.app = $s.SourceAppUserModelId
            $state.title = $props.Title
            $artist = $props.Artist
            $album = $props.AlbumTitle
            if (-not $album -and $artist -and $artist.Contains([string][char]0x2014)) {
                $split = $artist -split (' ' + [char]0x2014 + ' '), 2
                if ($split.Count -eq 2) { $artist = $split[0]; $album = $split[1] }
            }
            $state.artist = $artist
            $state.album = $album
            $state.thumbKey = $thumbKey
            $state.status = $pb.PlaybackStatus.ToString().ToLower()
            $state.positionMs = [long]$tl.Position.TotalMilliseconds
            $state.startMs = [long]$tl.StartTime.TotalMilliseconds
            $state.endMs = [long]$tl.EndTime.TotalMilliseconds
            $state.updatedAt = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
            $state.shuffle = $pb.IsShuffleActive
            $state.repeat = $repeat
            $state.canPlay = $c.IsPlayEnabled
            $state.canPause = $c.IsPauseEnabled
            $state.canNext = $c.IsNextEnabled
            $state.canPrev = $c.IsPreviousEnabled
            $state.canSeek = $c.IsPlaybackPositionEnabled
            $state.canShuffle = $c.IsShuffleEnabled
            $state.canRepeat = $c.IsRepeatEnabled

            if ($thumbKey -ne $lastThumbKey) {
                $lastThumbKey = $thumbKey
                Send-Thumb $props $thumbKey
                $thumbRetryAt = (Get-Date).AddSeconds(2)
            } elseif ($thumbRetryAt -and (Get-Date) -gt $thumbRetryAt) {
                $thumbRetryAt = $null
                Send-Thumb $props $thumbKey
            }
        }
    } catch { }

    $json = $state | ConvertTo-Json -Compress
    if ($json -ne $lastJson) {
        $lastJson = $json
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
    }

    Start-Sleep -Milliseconds 400
}
`;
