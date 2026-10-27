<?php

declare(strict_types=1);

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

    foreach (['/kradan', '/kradan/x', '/kradan/api/boards', '/kradan/api/v1/boards', '/kradan/f/1/9999999999/abc/index.html'] as $url) {
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

it('asks the callback with the user and view or manage', function (): void {
    publishRound();
    $asked = [];
    Kradan::auth(function ($user, string $ability) use (&$asked): bool {
        $asked[] = $ability;

        return $ability === 'view';
    });

    actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertOk();
    actingAs(kradanUser())->postJson('/kradan/api/boards/t188-manual-so/decide')->assertForbidden();

    expect($asked)->toContain('view', 'manage');

    Kradan::auth(fn ($user, string $ability): bool => false);

    actingAs(kradanUser())->get('/kradan')->assertForbidden();
    actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertForbidden();
    actingAs(kradanUser())->getJson('/kradan/api/boards/t188-manual-so')->assertForbidden();
});

it('lets a user with manage mark a board decided', function (): void {
    publishRound();
    Kradan::auth(fn ($user, string $ability): bool => $ability === 'view' || $user->name === 'owner');

    actingAs(kradanUser('viewer'))->postJson('/kradan/api/boards/t188-manual-so/decide')->assertForbidden();

    $owner = kradanUser('owner');
    actingAs($owner)->postJson('/kradan/api/boards/t188-manual-so/decide')
        ->assertOk()
        ->assertJsonPath('status', 'decided')
        ->assertJsonPath('decided_by.name', 'owner')
        ->assertJsonPath('slug', 't188-manual-so')
        ->assertJsonStructure(['rounds', 'current', 'picks', 'comments', 'viewers', 'seen_prints']);
});

it('serves a board at /kradan/{slug} and 404s an unknown one', function (): void {
    publishRound();

    actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertOk();
    actingAs(kradanUser())->get('/kradan/nope')->assertNotFound();
});

it('keeps the board routes on the session and CSRF stack', function (): void {
    $middleware = app('router')->getRoutes()->getByName('kradan.api.picks.update')->gatherMiddleware();

    expect($middleware)->toContain('web');
});
