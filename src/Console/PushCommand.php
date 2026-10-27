<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Phattarachai\Kradan\Support\Bundle;
use Phattarachai\Kradan\Support\KradanRemote;
use Phattarachai\Kradan\Support\StepParser;
use Symfony\Component\Finder\SplFileInfo;
use ZipArchive;

final class PushCommand extends Command
{
    protected $signature = 'kradan:push
        {dir : the design folder, e.g. public/design/<slug>}
        {--slug= : the board slug (default: the folder name)}
        {--kind= : decision or flow (default: the board\'s current kind, or decision)}
        {--task= : a task reference shown with the title, e.g. T188}
        {--dry-run : list what would be pushed without sending it}';

    protected $description = 'Push a design folder to the Kradan server as a board round';

    public function handle(KradanRemote $remote, StepParser $parser): int
    {
        $dir = rtrim((string) $this->argument('dir'), '/');

        if (! File::isFile("{$dir}/index.html")) {
            $this->components->error("{$dir}/index.html not found.");

            return self::FAILURE;
        }

        $slug = (string) ($this->option('slug') ?: basename($dir));
        $zip = $this->zip($dir);
        $bundle = Bundle::fromZip($zip);
        $parsed = $parser->parse((string) $bundle->get('index.html'), $bundle->get(...));

        $this->components->twoColumnDetail('board', $slug);
        $this->components->twoColumnDetail('round title', $parsed['title']);
        $this->components->twoColumnDetail('files · steps', count($bundle->files).' · '.count($parsed['steps']));

        if ($this->option('dry-run')) {
            File::delete($zip);

            return self::SUCCESS;
        }

        $result = $remote->push($zip, $slug, $this->option('kind'), $this->option('task'));
        File::delete($zip);

        $this->components->info(($result['created'] ? 'New round ' : 'Updated round ')."{$result['round']}: {$result['board_url']}");

        return self::SUCCESS;
    }

    private function zip(string $dir): string
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'kradan-').'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        /** @var SplFileInfo $file */
        foreach (File::allFiles($dir, hidden: false) as $file) {
            $relative = str_replace('\\', '/', $file->getRelativePathname());

            if (! self::skipped($relative)) {
                $zip->addFile($file->getPathname(), $relative);
            }
        }

        $zip->close();

        return $path;
    }

    private static function skipped(string $relative): bool
    {
        $top = explode('/', $relative)[0];

        return $top === 'rounds'
            || ($top === $relative && (str_starts_with($relative, 'review') || $relative === 'workbench.json'));
    }
}
