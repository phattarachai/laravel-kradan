<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Enums\ItemKind;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Http\Requests\ItemRequest;
use Phattarachai\Kradan\Http\Requests\ItemUpdateRequest;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ActivityLog;
use Phattarachai\Kradan\Support\BoardPresenter;
use Phattarachai\Kradan\Support\RoundPublisher;

/**
 * Notes, text, images, files and drawings users add to a board. Anyone may
 * move an item; only its author edits or deletes it.
 *
 * @see 2-board-payload.md "Items (item 11)"
 */
final readonly class ItemController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private ActivityLog $activity) {}

    public function store(ItemRequest $request, string $slug): JsonResponse
    {
        $board = $this->findBoard($slug);
        $round = $this->latestRound($board, $request->integer('round') ?: null);
        $step = (string) $request->validated('step');
        $kind = ItemKind::from((string) $request->validated('kind'));

        throw_if($round->step($step) === null, ValidationException::withMessages(['step' => trans('kradan::ui.unknown_step')]));

        $item = new Item([
            'board_id' => $board->id,
            'round_id' => $round->id,
            'step_key' => $step,
            'user_id' => $this->userId(),
            'kind' => $kind,
            ...($kind->hasFile() ? $this->upload($board, $request->file('file')) : []),
        ]);
        $item->fill($this->attributes($request->validated()))->save();

        $this->activity->record($board, ActivityAction::Item, $this->userId(), $round, ['step' => $step, 'item' => $item->id, 'kind' => $kind->value]);

        return response()->json($this->presenter->item($item, $this->user()), 201);
    }

    public function update(ItemUpdateRequest $request, int $item): JsonResponse
    {
        $model = $this->visibleItem($item);

        abort_if($request->changesContent() && ! $this->owns($model), 403, trans('kradan::ui.not_yours_item'));

        $model->update($this->attributes($request->validated()));

        return response()->json($this->presenter->item($model, $this->user()));
    }

    public function destroy(int $item): Response
    {
        $model = $this->visibleItem($item);

        abort_unless($this->owns($model), 403, trans('kradan::ui.not_yours_item'));

        $model->delete();

        return response()->noContent();
    }

    private function latestRound(Board $board, ?int $number): Round
    {
        /** @var Round|null $round */
        $round = $board->latestRound()->first();
        abort_unless($round instanceof Round, 404);
        abort_if($number !== null && $number !== $round->number, 409, trans('kradan::ui.round_readonly'));

        return $round->setRelation('board', $board);
    }

    private function visibleItem(int $id): Item
    {
        $item = Item::query()->with('board')->findOrFail($id);
        $this->findBoard($item->board->slug);

        return $item;
    }

    private function owns(Item $item): bool
    {
        return $item->user_id === $this->userId();
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function attributes(array $validated): array
    {
        return collect($validated)
            ->only(['anchor', 'x', 'y', 'w', 'h', 'color', 'text', 'points', 'texts'])
            ->all();
    }

    /**
     * @return array{file_path: string, file_name: string, file_type: string, file_size: int}
     */
    private function upload(Board $board, ?UploadedFile $file): array
    {
        abort_unless($file instanceof UploadedFile, 422);

        $extension = strtolower($file->getClientOriginalExtension());
        $path = "kradan/{$board->slug}/attachments/".Str::ulid()->toBase32().($extension === '' ? '' : ".{$extension}");
        RoundPublisher::disk()->put($path, (string) $file->get());

        return [
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
            'file_size' => (int) $file->getSize(),
        ];
    }
}
