<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Models\Activity;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

final class ActivityLog
{
    private const int VIEW_WINDOW_MINUTES = 30;

    /**
     * @param  array<string, mixed>  $meta
     */
    public function record(Board $board, ActivityAction $action, ?string $userId, ?Round $round = null, array $meta = []): Activity
    {
        return Activity::query()->create([
            'board_id' => $board->id,
            'round_id' => $round?->id,
            'user_id' => $userId,
            'action' => $action,
            'meta' => $meta === [] ? null : $meta,
        ]);
    }

    /**
     * One view per user, per board, per 30 minutes: a board left open and
     * heartbeating all afternoon reads as a handful of visits, not hundreds.
     */
    public function view(Board $board, string $userId, ?Round $round = null): void
    {
        $recent = Activity::query()
            ->where('board_id', $board->id)
            ->where('user_id', $userId)
            ->where('action', ActivityAction::View)
            ->where('created_at', '>=', Date::now()->subMinutes(self::VIEW_WINDOW_MINUTES))
            ->exists();

        if (! $recent) {
            $this->record($board, ActivityAction::View, $userId, $round);
        }
    }
}
