<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Validation\ValidationException;
use ZipArchive;

/**
 * The files of one pushed design folder, read from its zip. Anything the
 * local workbench keeps for itself (rounds/, review*, workbench.json) is
 * dropped, and any entry that would land outside the folder is refused.
 */
final readonly class Bundle
{
    private const int MAX_FILES = 2000;

    private const int MAX_BYTES = 100 * 1024 * 1024;

    /**
     * @param  array<string, string>  $files  path => contents
     */
    public function __construct(public array $files) {}

    public static function fromZip(string $path): self
    {
        $zip = new ZipArchive;

        if ($zip->open($path, ZipArchive::RDONLY) !== true) {
            throw ValidationException::withMessages(['bundle' => trans('kradan::ui.bundle_unreadable')]);
        }

        $files = self::read($zip);
        $zip->close();

        if (! isset($files['index.html'])) {
            throw ValidationException::withMessages(['bundle' => trans('kradan::ui.bundle_no_index')]);
        }

        return new self($files);
    }

    public function get(string $path): ?string
    {
        $safe = SafePath::normalize($path);

        return $safe === null ? null : ($this->files[$safe] ?? null);
    }

    /**
     * @return array<string, string>
     */
    private static function read(ZipArchive $zip): array
    {
        throw_if($zip->numFiles > self::MAX_FILES, ValidationException::withMessages(['bundle' => trans('kradan::ui.bundle_too_large')]));

        $files = [];
        $bytes = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = (array) $zip->statIndex($i);
            $name = (string) ($stat['name'] ?? '');

            if (str_ends_with($name, '/')) {
                continue;
            }

            $path = SafePath::normalize($name);
            throw_if($path === null, ValidationException::withMessages(['bundle' => trans('kradan::ui.bundle_bad_path', ['path' => $name])]));

            if (self::ignored($path)) {
                continue;
            }

            $bytes += (int) ($stat['size'] ?? 0);
            throw_if($bytes > self::MAX_BYTES, ValidationException::withMessages(['bundle' => trans('kradan::ui.bundle_too_large')]));

            $files[$path] = (string) $zip->getFromIndex($i);
        }

        return $files;
    }

    private static function ignored(string $path): bool
    {
        $segments = explode('/', $path);
        $base = end($segments);
        $topLevel = count($segments) === 1;

        return in_array($segments[0], ['rounds', '__MACOSX'], strict: true)
            || ($topLevel && (str_starts_with($base, 'review') || $base === 'workbench.json'))
            || $base === '.DS_Store';
    }
}
