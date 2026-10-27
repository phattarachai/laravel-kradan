<?php

declare(strict_types=1);

use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Kradan;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\get;
use function Pest\Laravel\getJson;

it('redirects a guest to the login screen and remembers where they were going', function (): void {
    get('/kradan')->assertRedirect('/login');

    expect(session('url.intended'))->toBe('http://localhost/kradan');
});

it('answers a guest XHR with 403 instead of a redirect', function (): void {
    getJson('/kradan/api/boards')->assertForbidden();
});

it('404s every Kradan URL, the token API included, when KRADAN_ENABLED is false', function (): void {
    $this->rebootWith(['kradan.enabled' => false]);

    foreach (['/kradan', '/kradan/decisions/x', '/kradan/api/boards', '/kradan/api/v1/boards', '/kradan/f/1/9999999999/abc/index.html'] as $url) {
        get($url, ['Authorization' => 'Bearer test-token'])->assertNotFound();
    }
});

it('lets only the local environment in when the host registered no auth callback', function (): void {
    Kradan::flush();
    $user = kradanUser();

    actingAs($user)->get('/kradan')->assertForbidden();

    app()->detectEnvironment(fn (): string => 'local');

    actingAs($user)->get('/kradan')->assertOk();
});

it('asks the callback per panel and ability, and keeps each panel to its own viewers', function (): void {
    $flow = publishRound('cover-flow', 'Cover flow', kind: BoardKind::Flow);
    $decision = publishRound('t188-manual-so');
    $asked = [];
    Kradan::auth(function ($user, string $panel, string $ability) use (&$asked): bool {
        $asked[] = "{$panel}:{$ability}";

        return $panel === 'flows' && $ability === 'view';
    });

    actingAs(kradanUser())->get('/kradan/flows/cover-flow')->assertOk();
    actingAs(kradanUser())->get('/kradan/decisions/t188-manual-so')->assertForbidden();
    actingAs(kradanUser())->getJson('/kradan/api/boards/t188-manual-so')->assertForbidden();
    actingAs(kradanUser())->postJson('/kradan/api/boards/cover-flow/decide')->assertForbidden();

    $listed = actingAs(kradanUser())->getJson('/kradan/api/boards')->assertOk()->json('boards');

    expect(array_column($listed, 'slug'))->toBe(['cover-flow'])
        ->and($asked)->toContain('flows:view', 'decisions:view', 'flows:manage')
        ->and(boardOf($flow)->panel())->toBe('flows')
        ->and(boardOf($decision)->panel())->toBe('decisions');
});

it('lets a user with manage on the panel mark a board decided', function (): void {
    publishRound();
    Kradan::auth(fn ($user, string $panel, string $ability): bool => $ability === 'view' || $user->name === 'owner');

    actingAs(kradanUser('viewer'))->postJson('/kradan/api/boards/t188-manual-so/decide')->assertForbidden();

    $owner = kradanUser('owner');
    actingAs($owner)->postJson('/kradan/api/boards/t188-manual-so/decide')
        ->assertOk()
        ->assertJsonPath('status', 'decided')
        ->assertJsonPath('decided_by.name', 'owner')
        ->assertJsonPath('slug', 't188-manual-so')
        ->assertJsonStructure(['rounds', 'current', 'picks', 'comments', 'viewers', 'seen_prints']);
});

it('sends a board opened under the wrong panel to its own panel', function (): void {
    publishRound('cover-flow', 'Cover flow', kind: BoardKind::Flow);

    actingAs(kradanUser())->get('/kradan/decisions/cover-flow')->assertRedirect('http://localhost/kradan/flows/cover-flow');
});

it('keeps the board routes on the session and CSRF stack', function (): void {
    $middleware = app('router')->getRoutes()->getByName('kradan.api.picks.update')->gatherMiddleware();

    expect($middleware)->toContain('web');
});
