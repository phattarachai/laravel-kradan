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
            'kradan' => $this->presenter->boot($this->user(), $board, $round),
            'assets' => self::assets(),
        ]);
    }

    private function indexView(Request $request, ?string $panel): View
    {
        $kradan = $this->presenter->boot($this->user());

        return view('kradan::index', [
            'kradan' => [
                ...$kradan,
                'panel' => $panel,
                'q' => (string) $request->query('q', ''),
                'boards' => $this->index->list($this->user(), (string) $request->query('q', ''), $panel),
            ],
            'assets' => self::assets(),
        ]);
    }

    /**
     * @return array{js: string, css: string}
     */
    public static function assets(): array
    {
        return [
            'js' => AssetController::url('board.js'),
            'css' => AssetController::url('board.css'),
        ];
    }
}
