<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

/**
 * A relative path that cannot leave the folder it is resolved against: no
 * `..`, no absolute or drive paths, no backslashes, no control characters.
 */
final class SafePath
{
    public static function normalize(string $path): ?string
    {
        if ($path === '' || preg_match('/[\x00-\x1f\\\\]/', $path) === 1 || str_starts_with($path, '/') || preg_match('/^[a-z]+:/i', $path) === 1) {
            return null;
        }

        $segments = array_values(array_filter(explode('/', $path), fn (string $segment): bool => $segment !== '' && $segment !== '.'));

        if ($segments === [] || in_array('..', $segments, strict: true)) {
            return null;
        }

        return implode('/', $segments);
    }
}
