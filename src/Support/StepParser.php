<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Closure;
use Dom\Element;
use Dom\HTMLDocument;

/**
 * Reads a design page the way the design skill's workbench does: every
 * `[data-dp-step]` is a step, its `[data-dp-option]`s are the options, and a
 * step's print is its markup plus the screens its `[data-dp-frames]` load.
 */
final class StepParser
{
    private const string HARNESS = '/<!-- dp:harness:start -->.*?<!-- dp:harness:end -->/s';

    public static function stripHarness(string $html): string
    {
        return (string) preg_replace(self::HARNESS, '', $html);
    }

    /**
     * @param  Closure(string): ?string  $read  a sibling file's contents by its path relative to index.html
     * @return array{title: string, steps: list<array{key: string, group: string, title: string, sub: string, kind: string, options: list<array{key: string, title: string}>}>, prints: array<string, string>}
     */
    public function parse(string $html, Closure $read): array
    {
        $document = HTMLDocument::createFromString(self::stripHarness($html), LIBXML_NOERROR);
        $steps = [];
        $prints = [];

        foreach ($document->querySelectorAll('[data-dp-step]') as $element) {
            $step = $this->step($element, array_column($steps, 'key'));
            $steps[] = $step;
            $prints[$step['key']] = $this->print($document, $element, $read);
        }

        if ($steps === [] && $document->body !== null) {
            $steps[] = $this->wholePage($this->title($document));
            $prints[$steps[0]['key']] = $this->print($document, $document->body, $read);
        }

        return ['title' => $this->title($document), 'steps' => $steps, 'prints' => $prints];
    }

    /**
     * A page with no `[data-dp-step]` (a flow written as one page) is one
     * screen step, so comments and the export still have a step key.
     *
     * @return array{key: string, group: string, title: string, sub: string, kind: string, options: list<array{key: string, title: string}>}
     */
    private function wholePage(string $title): array
    {
        return ['key' => "|{$title}", 'group' => '', 'title' => $title, 'sub' => '', 'kind' => 'screen', 'options' => []];
    }

    private function title(HTMLDocument $document): string
    {
        $title = $document->body?->getAttribute('data-dp') ?: $document->title;

        return trim((string) $title);
    }

    /**
     * @param  list<string>  $taken
     * @return array{key: string, group: string, title: string, sub: string, kind: string, options: list<array{key: string, title: string}>}
     */
    private function step(Element $element, array $taken): array
    {
        $group = trim((string) ($element->closest('[data-dp-group]')?->getAttribute('data-title') ?: $element->getAttribute('data-group')));
        $title = trim((string) $element->getAttribute('data-title'));
        $options = $this->options($element);

        return [
            'key' => $this->uniqueKey("{$group}|{$title}", $taken),
            'group' => $group,
            'title' => $title,
            'sub' => trim((string) $element->getAttribute('data-sub')),
            'kind' => $options === [] ? 'screen' : 'question',
            'options' => $options,
        ];
    }

    /**
     * @return list<array{key: string, title: string}>
     */
    private function options(Element $step): array
    {
        $options = [];

        foreach ($step->querySelectorAll('[data-dp-option]') as $option) {
            $options[] = [
                'key' => trim((string) $option->getAttribute('data-key')),
                'title' => trim((string) ($option->getAttribute('data-label') ?: $option->getAttribute('data-title'))),
            ];
        }

        return $options;
    }

    /**
     * @param  list<string>  $taken
     */
    private function uniqueKey(string $key, array $taken): string
    {
        $candidate = $key;

        for ($n = 2; in_array($candidate, $taken, strict: true); $n++) {
            $candidate = "{$key}|{$n}";
        }

        return $candidate;
    }

    /**
     * @param  Closure(string): ?string  $read
     */
    private function print(HTMLDocument $document, Element $step, Closure $read): string
    {
        $screens = '';

        foreach ($step->querySelectorAll('[data-dp-frames]') as $frames) {
            $screens .= self::stripHarness((string) $read(self::localPath((string) $frames->getAttribute('data-src'))));
        }

        return substr(hash('sha256', $document->saveHtml($step).$screens), 0, 16);
    }

    /**
     * A frame's `data-src` as a path inside the bundle: no query or fragment,
     * no leading `./`.
     */
    public static function localPath(string $src): string
    {
        $path = (string) preg_replace('/[?#].*$/s', '', $src);

        return (string) preg_replace('#^(\./)+#', '', $path);
    }
}
