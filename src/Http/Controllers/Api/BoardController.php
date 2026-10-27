<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Http\Requests\HeartbeatRequest;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Models\Viewer;
use Phattarachai\Kradan\Support\ActivityLog;
use Phattarachai\Kradan\Support\BoardIndex;
use Phattarachai\Kradan\Support\BoardPresenter;
use Phattarachai\Kradan\Support\DecideBoard;
use Phattarachai\Kradan\Support\ReviewBuilder;

final readonly class BoardController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private ActivityLog $activity) {}

    public function index(Request $request, BoardIndex $index): JsonResponse
    {
        return response()->json([
            'boards' => $index->list($this->user(), (string) $request->query('q', ''), $request->query('panel')),
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        return response()->json($this->presenter->board($this->findBoard($slug), $this->user(), $request->integer('round') ?: null));
    }

    public function export(Request $request, string $slug): Response
    {
        $round = $this->exportRound($this->findBoard($slug), $request->integer('round') ?: null);

        return response(ReviewBuilder::for($round)->markdown(), 200, ['Content-Type' => 'text/markdown; charset=utf-8']);
    }

    public function heartbeat(HeartbeatRequest $request, string $slug): JsonResponse
    {
        $board = $this->findBoard($slug);
        $viewer = Viewer::query()->firstOrNew(['board_id' => $board->id, 'user_id' => $this->userId()]);
        $viewer->last_seen_at = Date::now();
        $viewer->seen_prints = [...($viewer->seen_prints ?? []), ...(array) $request->validated('prints_seen', [])];
        $viewer->save();

        $round = $board->rounds()->where('number', $request->integer('round'))->first();
        $this->activity->view($board, $this->userId(), $round);

        return response()->json(['viewers' => $this->presenter->viewers($board)]);
    }

    public function decide(string $slug, DecideBoard $decide): JsonResponse
    {
        $board = $decide($this->findBoard($slug, Ability::Manage), $this->userId());

        return response()->json(['board' => $this->presenter->summary($board)]);
    }

    private function exportRound(Board $board, ?int $number): Round
    {
        $round = $number === null
            ? $board->latestRound()->first()
            : $board->rounds()->where('number', $number)->first();

        abort_unless($round instanceof Round, 404);

        return $round->setRelation('board', $board);
    }
}
