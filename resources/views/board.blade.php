{{-- Kradan board shell. The backend renders it with $boot (the boot payload, 2-board-payload.md) and $assets
     (the URL of the folder serving dist/, no trailing slash). Everything else is board.js. --}}
<!doctype html>
<html lang="{{ $boot['locale'] ?? 'th' }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ $boot['board']['title'] ?? $boot['index']['title'] ?? $boot['brand']['name'] ?? 'Kradan' }}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{{ $assets }}/board.css?v={{ $boot['version'] }}">
</head>
<body class="kradan-board">
<div id="kradan"></div>
<script>window.Kradan = @json($boot);</script>
<script src="{{ $assets }}/board.js?v={{ $boot['version'] }}"></script>
</body>
</html>
