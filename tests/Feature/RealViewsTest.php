<?php

declare(strict_types=1);

use Illuminate\Support\Facades\View;

use function Pest\Laravel\actingAs;

beforeEach(function (): void {
    View::replaceNamespace('kradan', [dirname(__DIR__, 2).'/resources/views']);
});

/**
 * @return array<string, mixed>
 */
function realBoot(string $html): array
{
    preg_match('#window\.Kradan = (.*?);</script>#s', $html, $match);

    return json_decode($match[1] ?? 'null', true) ?? [];
}

it('renders the real board shell with the boot payload and the versioned assets', function (): void {
    publishRound();

    $html = actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertOk()->getContent();
    $boot = realBoot($html);

    expect($boot['page'])->toBe('board')
        ->and($boot['board']['url'])->toBe('http://localhost/kradan/t188-manual-so')
        ->and($html)->toContain('http://localhost/kradan/assets/board.js?v='.$boot['version'])
        ->toContain('http://localhost/kradan/assets/board.css?v='.$boot['version']);
});

it('renders the real index shell with the boards', function (): void {
    publishRound();

    $boot = realBoot(actingAs(kradanUser())->get('/kradan')->assertOk()->getContent());

    expect($boot['page'])->toBe('index')
        ->and(array_column($boot['index']['boards'], 'slug'))->toBe(['t188-manual-so']);
});
