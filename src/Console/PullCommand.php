<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\File;
use Phattarachai\Kradan\Support\KradanRemote;
use Phattarachai\Kradan\Support\SafePath;

/**
 * Files every round's answers into the design folder the way the design
 * skill's workbench does: rounds/NN/review.{json,md}, NN matched by the round's
 * `data-dp` title in rounds/rounds.json, and the latest round as review.md.
 */
final class PullCommand extends Command
{
    protected $signature = 'kradan:pull
        {board : the board slug, or its URL}
        {--to= : the design folder to write into (default: public/design/<slug>)}';

    protected $description = 'Pull a board\'s answers into review.md and review.json, one per round';

    public function handle(KradanRemote $remote): int
    {
        $slug = self::slugFrom((string) $this->argument('board'));
        $folder = rtrim((string) ($this->option('to') ?: base_path("public/design/{$slug}")), '/');
        $review = $remote->review($slug);

        File::ensureDirectoryExists("{$folder}/rounds");
        $rounds = $this->readRounds($folder);

        foreach ($review['rounds'] as $round) {
            $dir = $this->roundDir($rounds, $round['title']);
            File::ensureDirectoryExists("{$folder}/rounds/{$dir}");
            File::put("{$folder}/rounds/{$dir}/review.json", json_encode($round['json'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
            File::put("{$folder}/rounds/{$dir}/review.md", $round['markdown']);
            $this->components->twoColumnDetail("รอบ {$round['number']} · {$round['title']}", "rounds/{$dir}/review.md");
        }

        File::put("{$folder}/rounds/rounds.json", json_encode($rounds, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        $this->writeLatest($folder, $review['rounds']);
        $this->downloadAttachments($remote, $folder, $review['rounds']);

        return self::SUCCESS;
    }

    public static function slugFrom(string $board): string
    {
        $path = (string) (parse_url($board, PHP_URL_PATH) ?? $board);

        return basename(rtrim($path, '/'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function readRounds(string $folder): array
    {
        $file = "{$folder}/rounds/rounds.json";
        $rounds = File::exists($file) ? json_decode(File::get($file), true) : [];

        return is_array($rounds) ? array_values($rounds) : [];
    }

    /**
     * The local round folder with this title; a title the workbench never
     * snapshotted gets the next folder, marked text-only (answers, no screens).
     *
     * @param  list<array<string, mixed>>  $rounds
     */
    private function roundDir(array &$rounds, string $title): string
    {
        foreach ($rounds as $round) {
            if (($round['title'] ?? null) === $title) {
                return (string) $round['dir'];
            }
        }

        $dir = sprintf('%02d', max([0, ...array_map(fn (array $round): int => (int) ($round['dir'] ?? 0), $rounds)]) + 1);
        $rounds[] = ['dir' => $dir, 'title' => $title, 'created' => Date::now()->format('Y-m-d\TH:i:s'), 'textOnly' => true];

        return $dir;
    }

    /**
     * Every image and file users added, at the path the review lines name.
     *
     * @param  list<array{number: int, title: string, json: array<string, mixed>, markdown: string}>  $rounds
     */
    private function downloadAttachments(KradanRemote $remote, string $folder, array $rounds): void
    {
        $attachments = collect($rounds)
            ->flatMap(fn (array $round): array => (array) ($round['json']['attachments'] ?? []))
            ->keyBy(fn (array $attachment): string => (string) SafePath::normalize((string) $attachment['path']))
            ->filter(fn (array $attachment, string $path): bool => str_starts_with($path, 'attachments/'));

        foreach ($attachments as $path => $attachment) {
            File::ensureDirectoryExists(dirname("{$folder}/{$path}"));
            File::put("{$folder}/{$path}", $remote->download((string) $attachment['url']));
        }

        if ($attachments->isNotEmpty()) {
            $this->components->info($attachments->count()." attachment(s) → {$folder}/attachments");
        }
    }

    /**
     * @param  list<array{number: int, title: string, json: array<string, mixed>, markdown: string}>  $rounds
     */
    private function writeLatest(string $folder, array $rounds): void
    {
        $latest = end($rounds);

        if ($latest === false) {
            $this->components->warn('This board has no rounds yet.');

            return;
        }

        File::put("{$folder}/review.md", $latest['markdown']);
        $this->components->info("Latest round {$latest['number']} → {$folder}/review.md");
    }
}
