<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Models\Share;
use Phattarachai\Kradan\Support\ContentSigner;
use Phattarachai\Kradan\Support\ShareLinks;

/**
 * `/kradan/p/{token}`: a deck's public link. No login, no session, no board chrome: the page frames the
 * round's signed, sandboxed content in present mode and holds nothing else. Every failure is the same 404.
 */
final readonly class ShareController
{
    public function __construct(private ShareLinks $links, private ContentSigner $signer) {}

    public function __invoke(Request $request, string $token): Response
    {
        $share = $this->links->find($token);
        $round = $share instanceof Share ? $this->links->round($share) : null;

        if (! $share instanceof Share || ! $round instanceof Round) {
            return $this->respond(e(Kradan::trans('share_unavailable')), 404, "'none'");
        }

        $share->touchUsed();
        $base = $this->signer->baseUrl($round);

        $html = view('kradan::share', [
            'title' => $round->title !== '' ? $round->title : $share->board->title,
            'locale' => (string) config('kradan.locale', 'th'),
            'assets' => AssetController::base(),
            'version' => AssetController::version(),
            'boot' => [
                'title' => $share->board->title,
                'page_url' => "{$base}index.html",
                'origin' => self::origin($base),
                'slides' => count($round->steps),
                'start' => max(1, $request->integer('present', 1)),
            ],
        ])->render();

        return $this->respond($html, 200, "'self' ".self::origin($base));
    }

    /**
     * The share page loads only the package's own assets and frames only the content host.
     */
    private function respond(string $body, int $status, string $frames): Response
    {
        $assets = self::origin(AssetController::base());

        return response($body, $status, [
            'Content-Type' => 'text/html; charset=utf-8',
            'Content-Security-Policy' => implode('; ', [
                "default-src 'none'",
                "script-src {$assets}",
                "style-src {$assets}",
                "img-src {$assets} data:",
                "frame-src {$frames}",
                "base-uri 'none'",
                "form-action 'none'",
                "frame-ancestors 'none'",
            ]),
            'Referrer-Policy' => 'no-referrer',
            'X-Content-Type-Options' => 'nosniff',
            'X-Robots-Tag' => 'noindex, nofollow',
            'Cache-Control' => 'no-store',
        ]);
    }

    private static function origin(string $url): string
    {
        $parts = parse_url($url) ?: [];
        $port = isset($parts['port']) ? ":{$parts['port']}" : '';

        return ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? 'localhost').$port;
    }
}
