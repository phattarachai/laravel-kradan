<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Phattarachai\Kradan\Support\KradanRemote;

final class DecideCommand extends Command
{
    protected $signature = 'kradan:decide {slug : the board, or its URL}';

    protected $description = 'Mark a decision board decided (a flow board archived), moving it to history';

    public function handle(KradanRemote $remote): int
    {
        $board = $remote->decide(PullCommand::slugFrom((string) $this->argument('slug')));

        $this->components->info("{$board['slug']} is now {$board['status']}: {$board['url']}");

        return self::SUCCESS;
    }
}
