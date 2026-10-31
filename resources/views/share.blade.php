{{-- A deck's public link (/kradan/p/{token}): present mode only. No board chrome, no user, no API: the page
     frames the round's signed content and present.js drives it. The CSP allows nothing else. --}}
<!doctype html>
<html lang="{{ $locale }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>{{ $title }}</title>
<link rel="stylesheet" href="{{ $assets }}/present.css?v={{ $version }}">
</head>
<body class="kradan-share">
<script type="application/json" id="kradan-share">@json($boot)</script>
<script src="{{ $assets }}/present.js?v={{ $version }}"></script>
</body>
</html>
