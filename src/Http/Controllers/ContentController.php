<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ContentSigner;
use Phattarachai\Kradan\Support\MarkdownPage;
use Phattarachai\Kradan\Support\RoundPublisher;
use Phattarachai\Kradan\Support\SafePath;
use Phattarachai\Kradan\Support\StepParser;

/**
 * Serves a round's files to the board's sandboxed frames. Stateless: no
 * session, no cookie, only the path signature. Every response, errors
 * included, carries the sandbox CSP, so a page opened directly still gets an
 * opaque origin.
 *
 * @see 1-architecture.md "Content"
 */
final readonly class ContentController
{
    private const array TYPES = [
        'html' => 'text/html; charset=utf-8',
        'htm' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'mjs' => 'application/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'map' => 'application/json; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8',
        'md' => 'text/plain; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'avif' => 'image/avif',
        'ico' => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'otf' => 'font/otf',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'pdf' => 'application/pdf',
    ];

    public function __construct(private ContentSigner $signer) {}

    public function __invoke(Request $request, int $round, int $expires, string $signature, ?string $path = null): Response
    {
        if (! $this->signer->valid($round, $expires, $signature)) {
            return $this->respond('Forbidden', 403, 'txt');
        }

        if ($path === ContentSigner::AGENT) {
            return $this->script(AssetController::path('agent.js'));
        }

        if ($path === MarkdownPage::MERMAID) {
            return $this->script(MarkdownPage::mermaidPath());
        }

        $file = $this->file($round, $path);

        if ($file === null) {
            return $this->respond('Not found', 404, 'txt');
        }

        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $contents = (string) RoundPublisher::disk()->get($file);

        return $this->respond(
            in_array($extension, ['html', 'htm'], strict: true) ? $this->prepareHtml($contents, $request, $round, $expires, $signature) : $contents,
            200,
            $extension,
        );
    }

    private function file(int $roundId, ?string $path): ?string
    {
        $relative = ($path === null || $path === '' || str_ends_with($path, '/')) ? "{$path}index.html" : $path;
        $safe = SafePath::normalize($relative);
        $round = $safe === null ? null : Round::query()->with('board')->find($roundId);

        if (! $round instanceof Round) {
            return null;
        }

        $file = "{$round->directory()}/{$safe}";

        return RoundPublisher::disk()->exists($file) ? $file : null;
    }

    private function prepareHtml(string $html, Request $request, int $round, int $expires, string $signature): string
    {
        $tag = sprintf(
            '<script src="%s" data-parent="%s"></script>',
            e($this->signer->agentUrl($round, $expires, $signature)),
            e(self::parentOrigin($request)),
        );
        $html = StepParser::stripHarness($html);
        $at = strripos($html, '</body>');

        return $at === false ? $html.$tag : substr_replace($html, $tag, $at, 0);
    }

    private function script(string $path): Response
    {
        return is_file($path)
            ? $this->respond((string) file_get_contents($path), 200, 'js')
            : $this->respond('Not found', 404, 'txt');
    }

    private function respond(string $body, int $status, string $extension): Response
    {
        return response($body, $status, [
            'Content-Type' => self::TYPES[$extension] ?? 'application/octet-stream',
            'Content-Security-Policy' => 'sandbox allow-scripts',
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy' => 'no-referrer',
            'Cache-Control' => $status === 200 ? 'private, max-age=300' : 'no-store',
        ]);
    }

    /**
     * The origin of the board that frames this page: the request's own host
     * when content shares the app's host (option B), the app's host otherwise.
     */
    public static function parentOrigin(Request $request): string
    {
        if (! config('kradan.content_url')) {
            return $request->getSchemeAndHttpHost();
        }

        $app = parse_url((string) config('app.url')) ?: [];
        $scheme = $app['scheme'] ?? 'https';
        $host = config('kradan.domain') ?: ($app['host'] ?? $request->getHost());
        $port = isset($app['port']) && ! config('kradan.domain') ? ":{$app['port']}" : '';

        return "{$scheme}://{$host}{$port}";
    }
}
