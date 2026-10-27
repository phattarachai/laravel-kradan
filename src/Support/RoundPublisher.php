<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

/**
 * A push with the latest round's `data-dp` title replaces that round; a new
 * title opens the next round. Older rounds are never touched.
 */
final readonly class RoundPublisher
{
    public function __construct(private StepParser $parser, private ActivityLog $activity) {}

    /**
     * @return array{board: Board, round: Round, created: bool}
     */
    public function publish(string $slug, Bundle $bundle, ?BoardKind $kind = null, ?string $taskRef = null, ?string $title = null): array
    {
        $newKind = $bundle->isMarkdown() ? BoardKind::Flow : BoardKind::Decision;
        $bundle = $bundle->withPage($title ?? $slug);
        $parsed = $this->parser->parse((string) $bundle->get('index.html'), $bundle->get(...));
        $title = $parsed['title'] !== '' ? $parsed['title'] : $slug;

        [$board, $round, $created] = DB::connection(config('kradan.connection'))->transaction(function () use ($slug, $kind, $newKind, $taskRef, $title, $parsed): array {
            $board = $this->board($slug, $title, $kind, $taskRef, $newKind);
            $latest = $board->latestRound()->first();
            $created = $latest === null || $latest->title !== $title;

            $round = $created
                ? $this->open($board, $title, $parsed, ($latest->number ?? 0) + 1)
                : $this->replace($latest->setRelation('board', $board), $parsed);

            $this->activity->record($board, ActivityAction::Push, null, $round, ['title' => $title, 'created' => $created]);

            return [$board, $round, $created];
        });

        $this->store($round, $bundle);

        return ['board' => $board, 'round' => $round, 'created' => $created];
    }

    /**
     * A new board without a kind is a flow when written in markdown, a decision otherwise.
     */
    private function board(string $slug, string $title, ?BoardKind $kind, ?string $taskRef, BoardKind $newKind): Board
    {
        $board = Board::query()->firstOrNew(['slug' => $slug]);
        $board->title = self::boardTitle($title);
        $board->kind = $kind ?? $board->kind ?? $newKind;
        $board->task_ref = $taskRef ?? $board->task_ref;
        $board->status ??= BoardStatus::Open;
        $board->save();

        return $board;
    }

    /**
     * @param  array{steps: list<array<string, mixed>>, prints: array<string, string>}  $parsed
     */
    private function open(Board $board, string $title, array $parsed, int $number): Round
    {
        $board->update(['status' => BoardStatus::Open, 'decided_at' => null, 'decided_by' => null]);

        return Round::query()->create([
            'board_id' => $board->id,
            'number' => $number,
            'title' => $title,
            'steps' => $parsed['steps'],
            'prints' => $parsed['prints'],
            'pushed_at' => Date::now(),
        ])->setRelation('board', $board);
    }

    /**
     * @param  array{steps: list<array<string, mixed>>, prints: array<string, string>}  $parsed
     */
    private function replace(Round $round, array $parsed): Round
    {
        $round->update(['steps' => $parsed['steps'], 'prints' => $parsed['prints'], 'pushed_at' => Date::now()]);

        return $round;
    }

    private function store(Round $round, Bundle $bundle): void
    {
        $disk = self::disk();
        $disk->deleteDirectory($round->directory());

        foreach ($bundle->files as $path => $contents) {
            $disk->put("{$round->directory()}/{$path}", $contents);
        }
    }

    /**
     * "Manual SO ก่อนยืนยัน รอบ 2" names the round; the board is "Manual SO ก่อนยืนยัน".
     */
    public static function boardTitle(string $title): string
    {
        $stripped = trim((string) preg_replace('/[\s·\-–—(]*(รอบ|round)\s*\d+\)?\s*$/iu', '', $title));

        return $stripped !== '' ? $stripped : $title;
    }

    public static function disk(): Filesystem
    {
        return Storage::disk(config('kradan.disk', 'local'));
    }
}
