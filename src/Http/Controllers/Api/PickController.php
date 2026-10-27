<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Http\Requests\PickRequest;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ActivityLog;
use Phattarachai\Kradan\Support\BoardPresenter;

final readonly class PickController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private ActivityLog $activity) {}

    public function update(PickRequest $request, string $slug, int $number, string $step): JsonResponse
    {
        $board = $this->findBoard($slug);
        $round = $this->findRound($board, $number);

        abort_unless($round->isLatest(), 409, trans('kradan::ui.round_readonly'));
        abort_unless($board->isOpen(), 409, trans('kradan::ui.picks_locked'));

        $options = $this->options($round, $step, (array) $request->validated('options'));
        $seen = $options === [] && $request->boolean('seen');

        if ($options === [] && ! $seen) {
            Pick::query()->where(['round_id' => $round->id, 'step_key' => $step, 'user_id' => $this->userId()])->delete();

            return response()->json(['pick' => null]);
        }

        $pick = Pick::query()->updateOrCreate(
            ['round_id' => $round->id, 'step_key' => $step, 'user_id' => $this->userId()],
            ['options' => $options, 'seen' => $seen],
        );

        $this->activity->record($board, ActivityAction::Pick, $this->userId(), $round, ['step' => $step, 'options' => $options, 'seen' => $seen]);

        return response()->json(['pick' => $this->presenter->pick($pick)]);
    }

    /**
     * The picked keys in the step's own option order, so "A + B" never reads "B + A".
     *
     * @param  array<int, mixed>  $picked
     * @return list<string>
     */
    private function options(Round $round, string $stepKey, array $picked): array
    {
        $step = $round->step($stepKey);
        throw_if($step === null, ValidationException::withMessages(['step' => trans('kradan::ui.unknown_step')]));

        $keys = array_column($step['options'], 'key');
        $unknown = array_diff($picked, $keys);
        throw_if($unknown !== [], ValidationException::withMessages(['options' => trans('kradan::ui.unknown_option', ['option' => implode(', ', $unknown)])]));

        return array_values(array_intersect($keys, $picked));
    }
}
