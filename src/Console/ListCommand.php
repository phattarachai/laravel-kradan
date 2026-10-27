<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Phattarachai\Kradan\Support\KradanRemote;

final class ListCommand extends Command
{
    protected $signature = 'kradan:list';

    protected $description = 'List the boards on the Kradan server';

    public function handle(KradanRemote $remote): int
    {
        $this->table(
            ['slug', 'kind', 'status', 'round', 'title', 'url'],
            array_map(fn (array $board): array => [
                $board['slug'],
                $board['kind'],
                $board['status'],
                $board['round'] ?? '-',
                trim(($board['task_ref'] ?? '').' '.$board['title']),
                $board['url'],
            ], $remote->boards()),
        );

        return self::SUCCESS;
    }
}
