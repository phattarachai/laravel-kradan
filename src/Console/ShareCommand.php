<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Phattarachai\Kradan\Support\KradanRemote;
use Phattarachai\Kradan\Support\ShareLinks;

/**
 * A deck's public link: present only, no login. The token is printed once; the server keeps its hash.
 */
final class ShareCommand extends Command
{
    protected $signature = 'kradan:share
        {slug : the deck, or its board URL}
        {--days= : days until the link expires (default 14, 0 for never)}
        {--round= : pin a round (default: always the latest)}
        {--revoke= : revoke the link with this id instead}
        {--list : list the deck\'s links instead}';

    protected $description = 'Make, list or revoke a deck\'s public present-only link';

    public function handle(KradanRemote $remote): int
    {
        $slug = PullCommand::slugFrom((string) $this->argument('slug'));

        if ($this->option('list')) {
            $this->table(['id', 'round', 'expires', 'state', 'last opened'], array_map(fn (array $share): array => [
                $share['id'],
                $share['round'] ?? 'latest',
                $share['expires_at'] ?? 'never',
                $share['revoked_at'] !== null ? 'revoked' : ($share['active'] ? 'active' : 'expired'),
                $share['last_used_at'] ?? '-',
            ], $remote->shares($slug)));

            return self::SUCCESS;
        }

        if ($this->option('revoke') !== null) {
            $share = $remote->revoke((int) $this->option('revoke'));
            $this->components->info("Link {$share['id']} revoked: it now shows a 404.");

            return self::SUCCESS;
        }

        $days = $this->option('days') === null ? ShareLinks::DEFAULT_DAYS : (int) $this->option('days');
        $round = $this->option('round') === null ? null : (int) $this->option('round');
        $share = $remote->share($slug, $days, $round);

        $this->components->twoColumnDetail('id', (string) $share['id']);
        $this->components->twoColumnDetail('round', (string) ($share['round'] ?? 'latest'));
        $this->components->twoColumnDetail('expires', (string) ($share['expires_at'] ?? 'never'));
        $this->components->info("Public link (shown once): {$share['url']}");

        return self::SUCCESS;
    }
}
