<?php

declare(strict_types=1);

use Phattarachai\Kradan\Support\Theme;

use function Pest\Laravel\actingAs;

it('boots both pages with the kradan theme and no tokens by default', function (): void {
    publishRound();
    $user = kradanUser();

    foreach (['/kradan/t188-manual-so', '/kradan'] as $url) {
        $html = actingAs($user)->get($url)->assertOk()->getContent();

        expect(bootOf($html)['theme'])->toBe(['name' => 'kradan', 'tokens' => []], $url)
            ->and($html)->toContain('"theme":{"name":"kradan","tokens":{}}');
    }
});

it('boots a theme name or a token map, and keeps brand.accent', function (): void {
    config()->set('kradan.brand.accent', '#0055aa');
    config()->set('kradan.theme', 'workbench');

    $boot = bootOf(actingAs(kradanUser())->get('/kradan')->getContent());

    expect($boot['theme'])->toBe(['name' => 'workbench', 'tokens' => []])
        ->and($boot['brand']['accent'])->toBe('#0055aa');

    config()->set('kradan.theme', ['k-accent' => '#ba1a1a', 'chrome' => '#1f2937', 'sw' => '260px']);

    expect(bootOf(actingAs(kradanUser('วิภา'))->get('/kradan')->getContent())['theme'])
        ->toBe(['name' => 'kradan', 'tokens' => ['k-accent' => '#ba1a1a', 'chrome' => '#1f2937', 'sw' => '260px']]);
});

it('passes only colours and lengths under [a-z0-9-] names', function (): void {
    $cases = [
        'short hex' => ['k-accent', '#b11', true],
        'hex with alpha' => ['k-accent', '#ba1a1a80', true],
        'rgb' => ['chrome', 'rgb(31 41 55 / 80%)', true],
        'oklch' => ['chrome', 'oklch(0.62 0.17 145)', true],
        'keyword' => ['canvas', 'transparent', true],
        'px' => ['sw', '260px', true],
        'rem' => ['pw', '21.5rem', true],
        'zero' => ['pw', '0', true],
        'leading dashes' => ['--k-accent', '#ba1a1a', false],
        'upper case name' => ['K-Accent', '#ba1a1a', false],
        'closes the declaration' => ['k-accent', 'red; } body { display: none', false],
        'url' => ['canvas', 'url(https://evil.example/x.png)', false],
        'var' => ['canvas', 'var(--ink)', false],
        'nested call' => ['chrome', 'rgb(calc(1) 2 3)', false],
        'quote' => ['font-head', '"Inter"', false],
        'expression' => ['sw', 'expression(alert(1))', false],
        'newline' => ['chrome', "#fff\n}", false],
    ];

    foreach ($cases as $case => [$token, $value, $passes]) {
        config()->set('kradan.theme', [$token => $value]);

        expect(Theme::resolve()['tokens'])->toBe($passes ? [$token => $value] : [], $case)
            ->and(Theme::problems())->toHaveCount($passes ? 0 : 1, $case);
    }
});

it('falls back to kradan for an unknown theme name', function (): void {
    config()->set('kradan.theme', ['name' => 'dracula', 'k-accent' => '#ba1a1a']);

    expect(Theme::resolve())->toBe(['name' => 'kradan', 'tokens' => ['k-accent' => '#ba1a1a']])
        ->and(Theme::problems())->toBe(['Unknown theme [dracula], so the board uses kradan. Themes: kradan, workbench.']);

    config()->set('kradan.theme', null);

    expect(Theme::resolve()['name'])->toBe('kradan');
});

it('reports the theme in the doctor', function (): void {
    config()->set('kradan.theme', ['name' => 'workbench', 'k-accent' => '#ba1a1a']);

    $this->artisan('kradan:doctor')->expectsOutputToContain('Theme [workbench]')->doesntExpectOutputToContain('is dropped');

    config()->set('kradan.theme', ['k-accent' => 'red; }']);

    $this->artisan('kradan:doctor')
        ->expectsOutputToContain('Token [k-accent: red; }] is dropped')
        ->assertFailed();
});
