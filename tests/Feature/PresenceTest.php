<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

use function Pest\Laravel\actingAs;

it('registers no channel unless broadcasting is reverb', function (): void {
    expect(Broadcast::driver()->getChannels()->keys()->all())->not->toContain('kradan.board.{id}');
});

it('registers the presence channel kradan.board.{id} when broadcasting is reverb', function (): void {
    // The connection is named reverb, which is what Kradan checks; the log driver stands in so the suite needs no Pusher SDK.
    $this->rebootWith([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb' => ['driver' => 'log', 'key' => 'k', 'secret' => 's', 'app_id' => '1', 'options' => ['host' => 'ws.example.com', 'port' => 443, 'scheme' => 'https']],
    ]);

    expect(Broadcast::driver()->getChannels()->keys()->all())->toContain('kradan.board.{id}');
});

it('points the browser at the reverb app host, not the host the app publishes to', function (array $apps, array $door): void {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb' => ['driver' => 'log', 'key' => 'k', 'secret' => 's', 'app_id' => '1', 'options' => ['host' => '127.0.0.1', 'port' => 8080, 'scheme' => 'http']],
        'reverb.apps.apps' => $apps,
    ]);
    publishRound();

    $boot = bootOf(actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertOk()->getContent());

    expect($boot['presence']['reverb'])->toBe(['key' => 'k', ...$door]);
})->with([
    'the app with the same key' => [
        [['key' => 'other', 'options' => ['host' => 'other.example.com']], ['key' => 'k', 'options' => ['host' => 'ws.example.com', 'port' => '443', 'scheme' => 'https']]],
        ['host' => 'ws.example.com', 'port' => 443, 'scheme' => 'https'],
    ],
    'no app host, so the broadcasting options' => [
        [['key' => 'k', 'options' => ['host' => null]]],
        ['host' => '127.0.0.1', 'port' => 8080, 'scheme' => 'http'],
    ],
]);
