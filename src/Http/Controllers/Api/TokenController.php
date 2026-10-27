<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Http\Requests\PushRequest;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\BoardPresenter;
use Phattarachai\Kradan\Support\Bundle;
use Phattarachai\Kradan\Support\DecideBoard;
use Phattarachai\Kradan\Support\ReviewBuilder;
use Phattarachai\Kradan\Support\RoundPublisher;

/**
 * The bearer-token API the kradan:* commands call from a developer's checkout.
 */
final readonly class TokenController
{
    public function __construct(private BoardPresenter $presenter) {}

    public function push(PushRequest $request, RoundPublisher $publisher): JsonResponse
    {
        /** @var UploadedFile $file */
        $file = $request->file('bundle');
        $kind = $request->validated('kind');

        $result = $publisher->publish(
            (string) $request->validated('slug'),
            Bundle::fromZip((string) $file->getRealPath()),
            $kind === null ? null : BoardKind::from((string) $kind),
            $request->validated('task_ref'),
        );

        return response()->json([
            'board_url' => $result['board']->url(),
            'round' => $result['round']->number,
            'title' => $result['round']->title,
            'steps' => count($result['round']->steps),
            'created' => $result['created'],
        ], $result['created'] ? 201 : 200);
    }

    public function boards(): JsonResponse
    {
        $boards = Board::query()->with('latestRound')->latest('updated_at')->get();

        return response()->json([
            'boards' => $boards->map(fn (Board $board): array => [
                ...$this->presenter->summary($board),
                'url' => $board->url(),
                'round' => $board->latestRound?->number,
                'round_title' => $board->latestRound?->title,
            ])->values()->all(),
        ]);
    }

    public function review(string $slug): JsonResponse
    {
        $board = Board::query()->where('slug', $slug)->firstOrFail();

        return response()->json([
            'board' => [...$this->presenter->summary($board), 'url' => $board->url()],
            'rounds' => $board->rounds()->get()->map(function (Round $round) use ($board): array {
                $review = ReviewBuilder::for($round->setRelation('board', $board));

                return ['number' => $round->number, 'title' => $round->title, 'json' => $review->json(), 'markdown' => $review->markdown()];
            })->values()->all(),
        ]);
    }

    public function decide(string $slug, DecideBoard $decide): JsonResponse
    {
        $board = $decide(Board::query()->where('slug', $slug)->firstOrFail(), null);

        return response()->json(['board' => [...$this->presenter->summary($board), 'url' => $board->url()]]);
    }
}
