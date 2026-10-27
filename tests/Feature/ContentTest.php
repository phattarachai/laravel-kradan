<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Storage;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ContentSigner;

use function Pest\Laravel\get;

/**
 * The path part of a round's signed base URL, e.g. /kradan/f/1/1767225600/ab12…/
 */
function contentBase(int $round): string
{
    return (string) parse_url(app(ContentSigner::class)->baseUrl(Round::query()->with('board')->findOrFail($round)), PHP_URL_PATH);
}

it('serves a round page sandboxed: CSP, nosniff, harness stripped, agent injected with the parent origin', function (): void {
    $round = publishRound();

    $response = get(contentBase($round->id))->assertOk();
    $html = $response->getContent();

    $response->assertHeader('Content-Security-Policy', 'sandbox allow-scripts')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Content-Type', 'text/html; charset=utf-8');

    expect($html)->not->toContain('dp:harness')
        ->and($html)->not->toContain('/design/harness.js')
        ->and($html)->toMatch('#<script src="http://localhost/kradan/f/'.$round->id.'/\d+/[a-f0-9]+/__kradan/agent\.js" data-parent="http://localhost"></script>\s*</body>#')
        ->and($response->headers->getCookies())->toBe([]);
});

it('serves the files a page links to under the same prefix, sandboxed too', function (): void {
    $base = contentBase(publishRound()->id);

    get($base.'style.css')->assertOk()
        ->assertHeader('Content-Type', 'text/css; charset=utf-8')
        ->assertHeader('Content-Security-Policy', 'sandbox allow-scripts');

    get($base.'screen.html')->assertOk()->assertSee('ยืนยัน', escape: false)->assertSee('__kradan/agent.js', escape: false);
});

it('refuses an expired URL', function (): void {
    $base = contentBase(publishRound()->id);

    Date::setTestNow(Date::now()->addMinutes(config('kradan.signed_ttl') + 61));

    get($base.'index.html')->assertForbidden()->assertHeader('Content-Security-Policy', 'sandbox allow-scripts');
});

it('refuses a tampered signature, expiry or round', function (): void {
    $first = publishRound();
    $second = publishRound('other-board');
    [, , , $roundId, $expires, $signature] = explode('/', rtrim(contentBase($first->id), '/'));

    $cases = [
        'signature' => "/kradan/f/{$roundId}/{$expires}/".strrev($signature).'/index.html',
        'expiry' => '/kradan/f/'.$roundId.'/'.($expires + 3600)."/{$signature}/index.html",
        'round' => "/kradan/f/{$second->id}/{$expires}/{$signature}/index.html",
    ];

    foreach ($cases as $case => $url) {
        expect(get($url)->status())->toBe(403, "tampered {$case}");
    }
});

it('never serves a file outside the round folder', function (): void {
    $round = publishRound();
    $secret = publishRound('secret-board', files: ['secret.txt' => 'top secret']);
    Storage::disk('local')->put('kradan/t188-manual-so/secret.txt', 'one level up');
    $base = contentBase($round->id);

    $cases = [
        '../../secret-board/1/secret.txt',
        '..%2F..%2Fsecret-board%2F1%2Fsecret.txt',
        '%2e%2e/%2e%2e/secret-board/1/secret.txt',
        '../secret.txt',
        'screen.html/../../secret.txt',
        '..%5Csecret.txt',
        '%2Fetc%2Fpasswd',
        'index.html%00.png',
    ];

    get(contentBase($secret->id).'secret.txt')->assertOk()->assertSee('top secret');

    foreach ($cases as $path) {
        $response = get($base.$path);

        expect($response->status())->toBe(404, $path)
            ->and($response->getContent())->not->toContain('secret');
    }
});

it('builds content URLs on the content host when content_url is set (option C)', function (): void {
    config()->set('kradan.content_url', 'https://design.example.com');
    $round = publishRound();

    $base = app(ContentSigner::class)->baseUrl($round);

    expect($base)->toStartWith("https://design.example.com/kradan/f/{$round->id}/");

    get(parse_url($base, PHP_URL_PATH))->assertOk()->assertSee('data-parent="http://localhost"', escape: false);
});
