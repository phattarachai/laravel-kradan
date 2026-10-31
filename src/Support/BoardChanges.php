<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Models\Activity;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Pick;

/**
 * When anything people answer on a board last changed, so an open board
 * re-fetches without Reverb. Soft-deleted rows count (their updated_at moves
 * on delete); a cleared pick is hard-deleted, so its activity entry counts.
 * Dates are CarbonInterface: a host may Date::use(CarbonImmutable::class).
 */
final class BoardChanges
{
    public static function at(Board $board): ?string
    {
        $rounds = $board->rounds()->pluck('id');

        $latest = collect([
            Pick::query()->whereIn('round_id', $rounds)->max('updated_at'),
            Comment::withTrashed()->whereIn('round_id', $rounds)->max('updated_at'),
            Item::withTrashed()->where('board_id', $board->id)->max('updated_at'),
            Activity::query()->where('board_id', $board->id)->where('action', ActivityAction::Pick)->max('created_at'),
        ])
            ->filter()
            ->map(fn (mixed $at): CarbonInterface => Date::parse((string) $at))
            ->max();

        return $latest?->toIso8601String();
    }
}
