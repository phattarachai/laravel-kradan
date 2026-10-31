<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;

/**
 * Files a board into history: picks lock, comments stay open. A new round
 * reopens it. A deck has nothing to decide, so it is refused.
 */
final readonly class DecideBoard
{
    public function __construct(private ActivityLog $activity) {}

    public function __invoke(Board $board, ?string $userId): Board
    {
        abort_if($board->isDeck(), 422, Kradan::trans('deck_no_decide'));

        $board->update([
            'status' => BoardStatus::Decided,
            'decided_at' => Date::now(),
            'decided_by' => $userId,
        ]);

        $this->activity->record($board, ActivityAction::Decide, $userId, meta: ['status' => $board->status->value]);

        return $board;
    }
}
