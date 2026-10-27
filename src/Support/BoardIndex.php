<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Str;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

/**
 * Every board the user may view, newest first, searchable by title, task ref
 * and step titles. Open boards and the history (decided, archived) both come
 * back; the page splits them by `status`.
 */
final readonly class BoardIndex
{
    public function __construct(private BoardPresenter $presenter) {}

    /**
     * @return list<array<string, mixed>>
     */
    public function list(Authenticatable $user, string $query = '', ?string $panel = null): array
    {
        $kinds = collect(Kradan::viewablePanels($user))
            ->when($panel !== null, fn ($panels) => $panels->intersect([$panel]))
            ->map(fn (string $key): string => Kradan::panels()[$key]['kind'])
            ->values()
            ->all();

        return Board::query()
            ->whereIn('kind', $kinds)
            ->with('latestRound')
            ->latest('updated_at')
            ->get()
            ->map(fn (Board $board): array => $this->row($board))
            ->filter(fn (array $row): bool => $this->matches($row, $query))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function row(Board $board): array
    {
        $round = $board->latestRound;

        return [
            ...$this->presenter->summary($board),
            'url' => $board->url(),
            'round' => $round instanceof Round ? ['number' => $round->number, 'title' => $round->title, 'pushed_at' => $round->pushed_at->toIso8601String()] : null,
            'steps' => $round instanceof Round ? array_column($round->steps, 'title') : [],
        ];
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
