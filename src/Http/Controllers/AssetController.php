<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Phattarachai\Kradan\Kradan;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serves the prebuilt board from the package's dist/, so the host needs no
 * vendor:publish and never serves a stale copy after an update. The shells
 * add `?v=<version>`; the short max-age covers a dist/ rebuilt in place.
 */
final class AssetController
{
    private static ?string $version = null;

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
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    /**
     * The folder URL the Blade shells append `/board.js` and `/board.css` to.
     */
    public static function base(): string
    {
        return url(trim((string) config('kradan.path', 'kradan'), '/').'/assets');
    }

    /**
     * The package version plus a hash of the built board, so a rebuilt dist/
     * gets new URLs even when the version was not bumped. Hashed once per process.
     */
    public static function version(): string
    {
        return self::$version ??= self::hashVersion();
    }

    private static function hashVersion(): string
    {
        $hashes = array_map(
            fn (string $file): string => is_file(self::path($file)) ? (string) md5_file(self::path($file)) : '',
            array_keys(self::FILES),
        );

        return implode('', $hashes) === '' ? Kradan::VERSION : Kradan::VERSION.'-'.substr(md5(implode('', $hashes)), 0, 10);
    }

    public static function path(string $file): string
    {
        return dirname(__DIR__, 3)."/dist/{$file}";
    }
}
