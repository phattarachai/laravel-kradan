<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

/**
 * Resolves `kradan.theme` into the boot payload's `theme: {name, tokens}`.
 * Tokens become CSS custom properties on the board's root, so only plain
 * colours and lengths pass: nothing that could close a declaration.
 */
final class Theme
{
    public const array NAMES = ['kradan', 'workbench'];

    private const string DEFAULT = 'kradan';

    private const string TOKEN = '/^[a-z0-9]+(-[a-z0-9]+)*$/';

    private const array VALUES = [
        '/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i',
        '/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9a-z.%, \/+-]*\)$/i',
        '/^[a-z]+$/i',
        '/^-?(\d+|\d*\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)?$/i',
    ];

    /**
     * @return array{name: string, tokens: array<string, string>}
     */
    public static function resolve(): array
    {
        $map = self::map();

        return [
            'name' => self::name($map),
            'tokens' => array_filter(self::tokens($map), self::valid(...), ARRAY_FILTER_USE_BOTH),
        ];
    }

    /**
     * @return list<string>
     */
    public static function problems(): array
    {
        $map = self::map();
        $problems = [];
        $name = $map['name'] ?? self::DEFAULT;

        if (! in_array($name, self::NAMES, true)) {
            $problems[] = 'Unknown theme ['.(is_scalar($name) ? $name : gettype($name)).'], so the board uses kradan. Themes: '.implode(', ', self::NAMES).'.';
        }

        foreach (self::tokens($map) as $token => $value) {
            if (! self::valid($value, $token)) {
                $problems[] = "Token [{$token}: {$value}] is dropped: names are [a-z0-9-] without the leading --, values a colour or a length.";
            }
        }

        return $problems;
    }

    /**
     * @return array<array-key, mixed>
     */
    private static function map(): array
    {
        $theme = config('kradan.theme');

        return is_array($theme) ? $theme : ['name' => $theme ?? self::DEFAULT];
    }

    /**
     * @param  array<array-key, mixed>  $map
     */
    private static function name(array $map): string
    {
        $name = $map['name'] ?? self::DEFAULT;

        return in_array($name, self::NAMES, true) ? $name : self::DEFAULT;
    }

    /**
     * @param  array<array-key, mixed>  $map
     * @return array<string, string>
     */
    private static function tokens(array $map): array
    {
        unset($map['name']);
        $tokens = [];

        foreach ($map as $token => $value) {
            $tokens[(string) $token] = is_scalar($value) ? trim((string) $value) : '';
        }

        return $tokens;
    }

    private static function valid(string $value, string $token): bool
    {
        if (preg_match(self::TOKEN, $token) !== 1) {
            return false;
        }

        return array_any(self::VALUES, fn (string $pattern): bool => preg_match($pattern, $value) === 1);
    }
}
