<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Str;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

/**
 * Every board, newest first, searchable by title, task ref and step titles.
 * Open boards and the history (decided) both come back; the page splits them
 * by `status`.
 */
final readonly class BoardIndex
{
    public function __construct(private BoardPresenter $presenter) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function list(Authenticatable $user, string $query = ''): array
    {
        return Board::query()
            ->with('latestRound')
            ->latest('updated_at')
            ->get()
            ->map(fn (Board $board): array => $this->row($board, $user))
            ->filter(fn (array $row): bool => $this->matches($row, $query))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function row(Board $board, Authenticatable $user): array
    {
        $round = $board->latestRound;

        return [
            ...$this->presenter->summary($board),
            'url' => $board->url(),
            'round' => $round instanceof Round ? ['number' => $round->number, 'title' => $round->title, 'pushed_at' => $round->pushed_at->toIso8601String()] : null,
            'steps' => $round instanceof Round ? array_column($round->steps, 'title') : [],
            'answered' => $round instanceof Round ? $this->answered($round) : 0,
            'viewers' => $this->presenter->viewers($board),
            'updated' => $round instanceof Round && $this->updated($round, $this->presenter->seenPrints($board, $user)),
        ];
    }

    private function answered(Round $round): int
    {
        return $round->picks()->pluck('user_id')
            ->merge($round->comments()->pluck('user_id'))
            ->unique()
            ->count();
    }

    /**
     * A step whose print differs from what this viewer last saw, a new step included.
     * Never on a first visit.
     *
     * @param  array<string, string>|null  $seen
     */
    private function updated(Round $round, ?array $seen): bool
    {
        return $seen !== null && collect($round->prints)->contains(fn (string $print, string $key): bool => ($seen[$key] ?? null) !== $print);
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function matches(array $row, string $query): bool
    {
        $query = trim($query);

        if ($query === '') {
            return true;
        }

        $haystack = implode("\n", [$row['title'], $row['task_ref'] ?? '', $row['slug'], ...$row['steps']]);

        return Str::contains($haystack, $query, ignoreCase: true);
    }
}
