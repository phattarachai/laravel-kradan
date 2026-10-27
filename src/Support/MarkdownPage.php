<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\Heading;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Node\Block\Document;
use League\CommonMark\Node\StringContainerHelper;
use League\CommonMark\Parser\MarkdownParser;
use League\CommonMark\Renderer\HtmlRenderer;

/**
 * A flow board written in markdown, rendered once at push into the
 * index.html the rest of Kradan serves. Raw HTML is kept: the page runs
 * sandboxed like any other round.
 *
 * @see 1-architecture.md "Flow boards from markdown"
 */
final class MarkdownPage
{
    public const string MERMAID = '__kradan/mermaid.js';

    /**
     * @return array{title: string, html: string}
     */
    public function render(string $markdown, string $fallbackTitle): array
    {
        $mermaid = new MermaidRenderer;
        $environment = $this->environment($mermaid);
        $document = new MarkdownParser($environment)->parse($markdown);
        $title = $this->firstHeading($document) ?? $fallbackTitle;
        $body = (string) new HtmlRenderer($environment)->renderDocument($document);

        return ['title' => $title, 'html' => $this->page($title, $body, $mermaid->used)];
    }

    private function environment(MermaidRenderer $mermaid): Environment
    {
        $environment = new Environment([
            'html_input' => 'allow',
            'allow_unsafe_links' => true,
        ]);
        $environment->addExtension(new CommonMarkCoreExtension);
        $environment->addExtension(new GithubFlavoredMarkdownExtension);
        $environment->addRenderer(FencedCode::class, $mermaid, 100);

        return $environment;
    }

    private function firstHeading(Document $document): ?string
    {
        foreach ($document->iterator() as $node) {
            if ($node instanceof Heading && $node->getLevel() === 1) {
                $title = trim(StringContainerHelper::getChildText($node));

                return $title === '' ? null : $title;
            }
        }

        return null;
    }

    private function page(string $title, string $body, bool $mermaid): string
    {
        $css = (string) file_get_contents(dirname(__DIR__, 2).'/resources/content/markdown.css');
        $title = e($title);
        $scripts = $mermaid ? self::mermaidTags() : '';

        return <<<HTML
            <!doctype html>
            <html>
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>{$title}</title>
            <style>{$css}</style>
            </head>
            <body data-dp="{$title}" data-kradan-source="markdown">
            <main class="kradan-md">
            {$body}
            </main>
            {$scripts}
            </body>
            </html>

            HTML;
    }

    private static function mermaidTags(): string
    {
        $src = self::MERMAID;

        return <<<HTML
            <script src="{$src}"></script>
            <script>mermaid.initialize({ startOnLoad: true, securityLevel: 'strict', theme: 'neutral' });</script>
            HTML;
    }

    public static function mermaidPath(): string
    {
        return dirname(__DIR__, 2).'/resources/content/mermaid.min.js';
    }
}
