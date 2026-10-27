<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Kill switch
    |--------------------------------------------------------------------------
    |
    | When false, no routes are registered at all: every Kradan URL 404s,
    | including the token API. Enable it on the one environment your team
    | reviews on.
    |
    */

    'enabled' => env('KRADAN_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | Routing
    |--------------------------------------------------------------------------
    |
    | The Authorize middleware is always appended by the service provider, so
    | the gate can never be forgotten by editing `middleware`.
    |
    */

    'path' => env('KRADAN_PATH', 'kradan'),

    'domain' => env('KRADAN_DOMAIN'),

    'middleware' => ['web'],

    /*
    | The auth guard whose user reviews boards. null uses the default guard.
    */
    'guard' => null,

    /*
    | Where a guest is sent. A route name (preferred) or a URL; null 403s.
    */
    'redirect_guests_to' => env('KRADAN_LOGIN_ROUTE', 'login'),

    /*
    |--------------------------------------------------------------------------
    | Storage
    |--------------------------------------------------------------------------
    |
    | `connection` holds the kradan_* tables; null is the default connection.
    | Round files live on `disk`, under `kradan/<slug>/<round>/`.
    |
    */

    'connection' => env('KRADAN_DB_CONNECTION'),

    'disk' => env('KRADAN_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Content
    |--------------------------------------------------------------------------
    |
    | Pages Claude made are served under a path-signed, expiring prefix with
    | `Content-Security-Policy: sandbox allow-scripts`, so their scripts run
    | in an opaque origin and never act with the viewer's session.
    |
    | content_url  null serves them from the app's own host. A URL such as
    |              https://design.example.com serves them from that host
    |              instead; point it at the same app.
    | signed_ttl   minutes a content URL stays valid.
    |
    */

    'content_url' => env('KRADAN_CONTENT_URL'),

    'signed_ttl' => (int) env('KRADAN_SIGNED_TTL', 240),

    /*
    |--------------------------------------------------------------------------
    | Branding
    |--------------------------------------------------------------------------
    */

    'brand' => [
        'name' => env('KRADAN_BRAND', env('APP_NAME', 'Kradan')),
        'logo' => env('KRADAN_LOGO'),
        'accent' => env('KRADAN_ACCENT', '#e11d2f'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Presence
    |--------------------------------------------------------------------------
    |
    | auto     reverb when broadcasting.default is reverb, otherwise polling
    | reverb   a presence channel kradan.board.{id}, plus the heartbeat
    | polling  the heartbeat alone (every 30 s)
    | off      no avatars
    |
    */

    'presence' => env('KRADAN_PRESENCE', 'auto'),

    /*
    |--------------------------------------------------------------------------
    | Token API (push and pull from Claude)
    |--------------------------------------------------------------------------
    |
    | `tokens` is a comma list of sha256 hashes of the accepted bearer tokens.
    | `php artisan kradan:token --write` makes one. To rotate, append the new
    | hash, switch the client, then drop the old one.
    |
    | `remote` is used by the kradan:* commands in a developer's checkout.
    |
    */

    'tokens' => array_values(array_filter(array_map(trim(...), explode(',', (string) env('KRADAN_TOKEN_HASHES', ''))))),

    'throttle' => env('KRADAN_THROTTLE', '60,1'),

    'max_bundle_kb' => (int) env('KRADAN_MAX_BUNDLE_KB', 20480),

    /*
    |--------------------------------------------------------------------------
    | Uploads (images and files users add to a board)
    |--------------------------------------------------------------------------
    |
    | `types` are file extensions. Images show on the board through the
    | sandboxed content prefix; every other type downloads as an attachment.
    |
    */

    'uploads' => [
        'max_kb' => (int) env('KRADAN_UPLOAD_MAX_KB', 20480),
        'types' => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip'],
    ],

    'remote' => [
        'url' => env('KRADAN_REMOTE_URL'),
        'token' => env('KRADAN_REMOTE_TOKEN'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Locale
    |--------------------------------------------------------------------------
    |
    | The language of the board's own copy: th or en.
    |
    */

    'locale' => env('KRADAN_LOCALE', 'th'),

];
