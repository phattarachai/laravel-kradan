<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Models\Viewer;

/**
 * The JSON the board and index pages boot from (`window.Kradan`) and the
 * board API's payload.
 *
 * @see 1-architecture.md "Boot payload"
 */
final readonly class BoardPresenter
{
    private const int ACTIVE_SECONDS = 120;

    private const int RECENT_MINUTES = 15;

    public function __construct(private ContentSigner $signer) {}

    /**
     * @return array<string, mixed>
     */
    public function boot(Authenticatable $user, ?Board $board = null, ?int $roundNumber = null): array
    {
        $panel = $board?->panel();

        return [
            'version' => Kradan::VERSION,
            'brand' => (array) config('kradan.brand'),
            'locale' => (string) config('kradan.locale', 'th'),
            'user' => [...Kradan::present($user), 'can' => ['manage' => $panel !== null && Kradan::allows($user, $panel, Ability::Manage)]],
            'csrf' => csrf_token(),
            'routes' => ['api' => url(trim((string) config('kradan.path'), '/').'/api'), 'index' => route('kradan.index')],
            'presence' => $this->presence($board),
            'panels' => $this->panels($user),
            'board' => $board instanceof Board ? $this->board($board, $user, $roundNumber) : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function board(Board $board, Authenticatable $user, ?int $roundNumber = null): array
    {
        $rounds = $board->rounds()->get()->each->setRelation('board', $board);
        $current = $rounds->firstWhere('number', $roundNumber) ?? $rounds->last();

        return [
            ...$this->summary($board),
            'url' => $board->url(),
            'rounds' => $rounds->map(fn (Round $round): array => [
                'number' => $round->number,
                'title' => $round->title,
                'pushed_at' => $round->pushed_at->toIso8601String(),
                'steps' => $round->steps,
                'prints' => $round->prints,
                'base_url' => $this->signer->baseUrl($round),
                'readonly' => $round->number !== $rounds->last()?->number,
            ])->values()->all(),
            'current' => $current?->number,
            'latest' => $rounds->last()?->number,
            'picks_locked' => $board->status !== BoardStatus::Open,
            ...($current instanceof Round ? $this->answers($current, $user) : ['picks' => [], 'comments' => [], 'progress' => []]),
            'viewers' => $this->viewers($board),
            'seen_prints' => (object) (Viewer::query()->where('board_id', $board->id)->where('user_id', (string) $user->getAuthIdentifier())->value('seen_prints') ?? []),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(Board $board): array
    {
        return [
            'slug' => $board->slug,
            'title' => $board->title,
            'kind' => $board->kind->value,
            'panel' => $board->panel(),
            'status' => $board->status->value,
            'task_ref' => $board->task_ref,
            'decided_at' => $board->decided_at?->toIso8601String(),
            'decided_by' => $board->decided_by === null ? null : Kradan::userById($board->decided_by),
            'updated_at' => $board->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return list<array{user: array{id: mixed, name: string, avatar: ?string}, last_seen_at: string, active: bool, recent: bool}>
     */
    public function viewers(Board $board): array
    {
        $now = Date::now();

        return Viewer::query()
            ->where('board_id', $board->id)
            ->latest('last_seen_at')
            ->get()
            ->map(fn (Viewer $viewer): array => [
                'user' => Kradan::userById($viewer->user_id),
                'last_seen_at' => $viewer->last_seen_at->toIso8601String(),
                'active' => $viewer->last_seen_at->greaterThanOrEqualTo($now->copy()->subSeconds(self::ACTIVE_SECONDS)),
                'recent' => $viewer->last_seen_at->greaterThanOrEqualTo($now->copy()->subMinutes(self::RECENT_MINUTES)),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function comment(Comment $comment, Authenticatable $user): array
    {
        return [
            'id' => $comment->id,
            'step' => $comment->step_key,
            'parent_id' => $comment->parent_id,
            'user' => Kradan::userById($comment->user_id),
            'mine' => $comment->user_id === (string) $user->getAuthIdentifier(),
            'body' => $comment->body,
            'pin' => $comment->pin,
            'edit' => $comment->edit,
            'created_at' => $comment->created_at?->toIso8601String(),
            'updated_at' => $comment->updated_at?->toIso8601String(),
            'replies' => $comment->relationLoaded('replies')
                ? $comment->replies->map(fn (Comment $reply): array => $this->comment($reply, $user))->values()->all()
                : [],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function pick(Pick $pick): array
    {
        return [
            'step' => $pick->step_key,
            'user' => Kradan::userById($pick->user_id),
            'options' => $pick->options,
            'seen' => $pick->seen,
            'updated_at' => $pick->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array{picks: list<array<string, mixed>>, comments: list<array<string, mixed>>, progress: list<array<string, mixed>>}
     */
    private function answers(Round $round, Authenticatable $user): array
    {
        return [
            'picks' => $round->picks()->oldest('id')->get()->map($this->pick(...))->values()->all(),
            'comments' => $round->comments()->whereNull('parent_id')->with('replies')->oldest('id')->get()
                ->map(fn (Comment $comment): array => $this->comment($comment, $user))->values()->all(),
            'progress' => ReviewBuilder::for($round)->progress(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function presence(?Board $board): array
    {
        $mode = Kradan::presenceMode();

        return [
            'mode' => $mode,
            'heartbeat' => 30,
            'reverb' => $mode === 'reverb' ? $this->reverb() : null,
            'channel' => $board instanceof Board && $mode === 'reverb' ? "kradan.board.{$board->id}" : null,
            'authEndpoint' => url('/broadcasting/auth'),
        ];
    }

    /**
     * @return array{key: string, host: string, port: int, scheme: string}
     */
    private function reverb(): array
    {
        $options = (array) config('broadcasting.connections.reverb.options', []);

        return [
            'key' => (string) config('broadcasting.connections.reverb.key'),
            'host' => (string) ($options['host'] ?? request()->getHost()),
            'port' => (int) ($options['port'] ?? 443),
            'scheme' => (string) ($options['scheme'] ?? 'https'),
        ];
    }

    /**
     * @return list<array{key: string, kind: string, title: string, url: string}>
     */
    private function panels(Authenticatable $user): array
    {
        return array_map(fn (string $panel): array => [
            'key' => $panel,
            'kind' => Kradan::panels()[$panel]['kind'],
            'title' => Kradan::panels()[$panel]['title'],
            'url' => route('kradan.panel', ['panel' => $panel]),
        ], Kradan::viewablePanels($user));
    }
}
