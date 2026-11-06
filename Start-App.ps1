$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$prefix = "http://127.0.0.1:8765/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "No se pudo iniciar el servidor local en el puerto 8765." -ForegroundColor Red
    Write-Host "Comprueba si ya hay otra instancia abierta o si el puerto está ocupado."
    throw
}

Write-Host "Organizador de dinero está abierto en $prefix" -ForegroundColor Green
Write-Host "Deja esta ventana abierta mientras uses la app. Pulsa Ctrl+C para cerrarla."
Start-Process $prefix

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = "index.html"
            }

            $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
            $rootPrefix = $root.TrimEnd("\") + "\"
            if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $context.Response.Close()
                continue
            }

            $contentTypes = @{
                ".html" = "text/html; charset=utf-8"
                ".js"   = "text/javascript; charset=utf-8"
                ".css"  = "text/css; charset=utf-8"
                ".json" = "application/json; charset=utf-8"
                ".svg"  = "image/svg+xml"
                ".png"  = "image/png"
            }
            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            if ($contentTypes.ContainsKey($extension)) {
                $context.Response.ContentType = $contentTypes[$extension]
            } else {
                $context.Response.ContentType = "application/octet-stream"
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $context.Response.Close()
        } catch {
            Write-Host "No se pudo atender una petición: $($_.Exception.Message)" -ForegroundColor Yellow
            if ($context.Response -and $context.Response.OutputStream.CanWrite) {
                $context.Response.StatusCode = 500
                $context.Response.Close()
            }
        }
    }
} finally {
    $listener.Close()
}
