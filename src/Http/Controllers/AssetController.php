<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serves the prebuilt board from the package's dist/, so the host needs no
 * vendor:publish and never serves a stale copy after an update.
 */
final class AssetController
{
    private const array FILES = [
        'board.js' => 'application/javascript; charset=utf-8',
        'board.css' => 'text/css; charset=utf-8',
    ];

    public function __invoke(string $file): BinaryFileResponse
    {
        $path = self::path($file);

        abort_unless(isset(self::FILES[$file]) && is_file($path), 404);

        return response()->file($path, [
            'Content-Type' => self::FILES[$file],
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    public static function url(string $file): string
    {
        $path = self::path($file);
        $version = is_file($path) ? substr((string) md5_file($path), 0, 12) : 'missing';

        return route('kradan.asset', ['file' => $file, 'v' => $version]);
    }

    public static function path(string $file): string
    {
        return dirname(__DIR__, 3)."/dist/{$file}";
    }
}
