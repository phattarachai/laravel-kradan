<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Broadcast;

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
