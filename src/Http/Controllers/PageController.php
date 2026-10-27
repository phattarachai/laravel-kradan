<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers;

use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;
use Phattarachai\Kradan\Http\Controllers\Concerns\ResolvesBoards;
use Phattarachai\Kradan\Support\BoardIndex;
use Phattarachai\Kradan\Support\BoardPresenter;

final readonly class PageController
{
    use ResolvesBoards;

    public function __construct(private BoardPresenter $presenter, private BoardIndex $index) {}

    public function index(): View
    {
        return view('kradan::index', [
            'boot' => $this->presenter->indexPage($this->user(), $this->index->list($this->user())),
            'assets' => AssetController::base(),
        ]);
    }

    public function board(Request $request, string $slug): View
    {
        return view('kradan::board', [
            'boot' => $this->presenter->boardPage($this->user(), $this->findBoard($slug), $request->integer('round') ?: null),
            'assets' => AssetController::base(),
        ]);
    }
}
