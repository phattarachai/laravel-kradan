<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Phattarachai\Kradan\Enums\ActivityAction;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Http\Requests\CommentRequest;
use Phattarachai\Kradan\Http\Requests\CommentUpdateRequest;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ActivityLog;
use Phattarachai\Kradan\Support\BoardPresenter;

final readonly class CommentController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private ActivityLog $activity) {}

    public function store(CommentRequest $request, string $slug, int $number): JsonResponse
    {
        $board = $this->findBoard($slug);
        $round = $this->findRound($board, $number);
        $step = (string) $request->validated('step');

        abort_unless($round->isLatest(), 409, trans('kradan::ui.round_readonly'));

        $itemId = $this->itemId($board, $step, $request->validated('item_id'));
        throw_if($itemId === null && $round->step($step) === null, ValidationException::withMessages(['step' => trans('kradan::ui.unknown_step')]));

        $parentId = $this->parentId($round, $step, $request->validated('parent_id'));
        $threadStart = $parentId === null && $itemId === null;
        $comment = Comment::query()->create([
            'round_id' => $round->id,
            'step_key' => $step,
            'parent_id' => $parentId,
            'item_id' => $itemId,
            'user_id' => $this->userId(),
            'body' => (string) ($request->validated('body') ?? ''),
            'pin' => $threadStart ? $request->validated('pin') : null,
            'edit' => $threadStart ? $request->validated('edit') : null,
        ]);

        $this->activity->record($board, $this->action($comment), $this->userId(), $round, ['step' => $step, 'comment' => $comment->id]);

        return response()->json($this->presenter->comment($comment, $this->user()), 201);
    }

    public function update(CommentUpdateRequest $request, int $comment): JsonResponse
    {
        $model = $this->ownComment($comment);
        $model->update(['body' => (string) $request->validated('body')]);

        return response()->json($this->presenter->comment($model, $this->user()));
    }

    public function destroy(int $comment): Response
    {
        $this->ownComment($comment)->delete();

        return response()->noContent();
    }

    private function ownComment(int $id): Comment
    {
        $comment = Comment::query()->with('round.board')->findOrFail($id);
        $this->findBoard($comment->round->board->slug);

        abort_unless($comment->user_id === $this->userId(), 403, trans('kradan::ui.not_yours'));

        return $comment;
    }

    /**
     * A reply to an item on this board, on the item's own step.
     */
    private function itemId(Board $board, string $step, mixed $itemId): ?int
    {
        if ($itemId === null) {
            return null;
        }

        $item = Item::query()->where('board_id', $board->id)->find((int) $itemId);

        throw_if($item === null || $item->step_key !== $step, ValidationException::withMessages(['item_id' => trans('kradan::ui.item_reply_step')]));

        return $item->id;
    }

    private function parentId(Round $round, string $step, mixed $parentId): ?int
    {
        if ($parentId === null) {
            return null;
        }

        $parent = Comment::query()->where('round_id', $round->id)->where('step_key', $step)->find((int) $parentId);

        throw_if($parent === null || $parent->parent_id !== null, ValidationException::withMessages(['parent_id' => trans('kradan::ui.reply_depth')]));

        return $parent->id;
    }

    private function action(Comment $comment): ActivityAction
    {
        return match (true) {
            $comment->edit !== null => ActivityAction::Edit,
            $comment->pin !== null => ActivityAction::Pin,
            default => ActivityAction::Comment,
        };
    }
}
