<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Http\Controllers\Concerns;

use Illuminate\Contracts\Auth\Authenticatable;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

trait ResolvesBoards
{
    protected function findBoard(string $slug, Ability $ability = Ability::View): Board
    {
        $board = Board::query()->where('slug', $slug)->firstOrFail();

        abort_unless(Kradan::allows($this->user(), $ability), 403);

        return $board;
    }

    protected function findRound(Board $board, int $number): Round
    {
        /** @var Round $round */
        $round = $board->rounds()->where('number', $number)->firstOrFail();

        return $round->setRelation('board', $board);
    }

    protected function user(): Authenticatable
    {
        $user = Kradan::user();
        abort_unless($user instanceof Authenticatable, 401);

        return $user;
    }

    protected function userId(): string
    {
        return (string) $this->user()->getAuthIdentifier();
    }
}
