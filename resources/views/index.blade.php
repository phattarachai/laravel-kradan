{{-- Kradan index shell. The backend renders it with $kradan (the boot payload, 1-architecture.md "Views and
     payload as built") and $assets ({js, css}: URLs of dist/board.js and dist/board.css). The rest is board.js. --}}
<!doctype html>
<html lang="{{ $kradan['locale'] ?? 'th' }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ $kradan['board']['title'] ?? $kradan['brand']['name'] ?? 'Kradan' }}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{{ $assets['css'] }}">
</head>
<body class="kradan-index">
<div id="kradan"></div>
<script>window.Kradan = @json($kradan);</script>
<script src="{{ $assets['js'] }}"></script>
</body>
</html>
