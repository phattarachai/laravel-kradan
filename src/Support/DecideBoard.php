<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Models\Board;

/**
 * Files a board into history: a decision board becomes decided (picks lock,
 * comments stay open), a flow becomes archived. A new round reopens it.
 */
final readonly class DecideBoard
{
    public function __construct(private ActivityLog $activity) {}

    public function __invoke(Board $board, ?string $userId): Board
    {
        $board->update([
            'status' => $board->kind === BoardKind::Flow ? BoardStatus::Archived : BoardStatus::Decided,
            'decided_at' => Date::now(),
            'decided_by' => $userId,
        ]);

        $this->activity->record($board, ActivityAction::Decide, $userId, meta: ['status' => $board->status->value]);

        return $board;
    }
}
