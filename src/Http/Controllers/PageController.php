<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Support\BoardIndex;
use Phattarachai\Kradan\Support\BoardPresenter;

final readonly class PageController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private BoardIndex $index) {}

    public function index(Request $request): View
    {
        return $this->indexView($request, null);
    }

    public function panel(Request $request, string $panel): View
    {
        abort_unless(Kradan::allows($this->user(), $panel, Ability::View), 403);

        return $this->indexView($request, $panel);
    }

    public function board(Request $request, string $panel, string $slug): View|RedirectResponse
    {
        $board = $this->findBoard($slug);

        if ($board->panel() !== $panel) {
            return redirect()->to($board->url());
        }

        $round = $request->integer('round') ?: null;

        return view('kradan::board', [
            'boot' => $this->presenter->boardPage($this->user(), $board, $round),
            'assets' => AssetController::base(),
        ]);
    }

    private function indexView(Request $request, ?string $panel): View
    {
        $query = (string) $request->query('q', '');

        return view('kradan::index', [
            'boot' => $this->presenter->indexPage($this->user(), $this->index->list($this->user(), $query, $panel), $panel, $query),
            'assets' => AssetController::base(),
        ]);
    }
}
