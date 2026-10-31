<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\Ability;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Item;
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
    public function boardPage(Authenticatable $user, Board $board, ?int $roundNumber = null): array
    {
        return [
            ...$this->boot($user, 'board'),
            'presence' => $this->presence($board),
            'board' => $this->board($board, $user, $roundNumber),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $boards
     * @return array<string, mixed>
     */
    public function indexPage(Authenticatable $user, array $boards): array
    {
        return [
            ...$this->boot($user, 'index'),
            'presence' => $this->presence(null),
            'index' => ['boards' => $boards],
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
                'prints' => (object) $round->prints,
                'base_url' => $this->signer->baseUrl($round),
                'readonly' => $round->number !== $rounds->last()?->number,
            ])->values()->all(),
            'current' => $current?->number,
            'latest' => $rounds->last()?->number,
            'picks_locked' => $board->status !== BoardStatus::Open,
            ...($current instanceof Round ? $this->answers($current, $user) : ['picks' => [], 'comments' => [], 'progress' => []]),
            'items' => $this->items($board, $user),
            'uploads' => [
                'max_kb' => (int) config('kradan.uploads.max_kb', 20480),
                'types' => array_values((array) config('kradan.uploads.types', [])),
            ],
            'viewers' => $this->viewers($board),
            'seen_prints' => $this->seenPrints($board, $user),
            'changed_at' => BoardChanges::at($board),
        ];
    }

    /**
     * null on the viewer's first visit, so the board flags nothing as updated.
     *
     * @return array<string, string>|null
     */
    public function seenPrints(Board $board, Authenticatable $user): ?array
    {
        $viewer = Viewer::query()->where('board_id', $board->id)->where('user_id', (string) $user->getAuthIdentifier())->first();

        if (! $viewer instanceof Viewer) {
            return null;
        }

        return $viewer->seen_prints ?? [];
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
            'status' => $board->status->value,
            'task_ref' => $board->task_ref,
            'label' => $board->label(),
            'decided_at' => $board->decided_at?->toIso8601String(),
            'decided_by' => $board->decided_by === null ? null : Kradan::userById($board->decided_by),
            'updated_at' => $board->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Who was on the board in the last 15 minutes, newest first; `active` is the last 2 minutes.
     *
     * @return list<array{user: array{id: mixed, name: string, avatar: ?string}, last_seen_at: string, active: bool}>
     */
    public function viewers(Board $board): array
    {
        $now = Date::now();

        return Viewer::query()
            ->where('board_id', $board->id)
            ->where('last_seen_at', '>=', $now->copy()->subMinutes(self::RECENT_MINUTES))
            ->latest('last_seen_at')
            ->get()
            ->map(fn (Viewer $viewer): array => [
                'user' => Kradan::userById($viewer->user_id),
                'last_seen_at' => $viewer->last_seen_at->toIso8601String(),
                'active' => $viewer->last_seen_at->greaterThanOrEqualTo($now->copy()->subSeconds(self::ACTIVE_SECONDS)),
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
            'item_id' => $comment->item_id,
            'user' => Kradan::userById($comment->user_id),
            'mine' => $comment->user_id === (string) $user->getAuthIdentifier(),
            'body' => $comment->body,
            'pin' => $comment->pin,
            'edit' => $comment->edit,
            'created_at' => $comment->created_at?->toIso8601String(),
            'updated_at' => $comment->updated_at?->toIso8601String(),
            ...($comment->parent_id === null ? ['replies' => $comment->replies->map(fn (Comment $reply): array => $this->comment($reply, $user))->values()->all()] : []),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function item(Item $item, Authenticatable $user): array
    {
        return [
            'id' => $item->id,
            'round' => $item->round?->number,
            'step' => $item->step_key,
            'kind' => $item->kind->value,
            'user' => Kradan::userById($item->user_id),
            'mine' => $item->user_id === (string) $user->getAuthIdentifier(),
            'created_at' => $item->created_at?->toIso8601String(),
            'updated_at' => $item->updated_at?->toIso8601String(),
            'reply_count' => (int) ($item->replies_count ?? $item->replies()->count()),
            'anchor' => $item->anchor,
            'x' => $item->x,
            'y' => $item->y,
            'w' => $item->w,
            'h' => $item->h,
            'color' => $item->color,
            'text' => $item->text,
            'points' => $item->points,
            'texts' => $item->texts,
            'file' => $this->file($item),
        ];
    }

    /**
     * @return array{name: string, type: ?string, size: ?int, url: string, thumb: ?string}|null
     */
    public function file(Item $item): ?array
    {
        if ($item->file_path === null) {
            return null;
        }

        $url = $this->signer->fileUrl($item);

        return [
            'name' => (string) $item->file_name,
            'type' => $item->file_type,
            'size' => $item->file_size,
            'url' => $url,
            'thumb' => $item->isImage() ? $url : null,
        ];
    }

    /**
     * Every item on the board, from every round, oldest first.
     *
     * @return list<array<string, mixed>>
     */
    private function items(Board $board, Authenticatable $user): array
    {
        return Item::query()
            ->where('board_id', $board->id)
            ->with('round')
            ->withCount('replies')
            ->oldest('id')
            ->get()
            ->map(fn (Item $item): array => $this->item($item, $user))
            ->values()
            ->all();
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
            'comments' => $this->comments($round, $user),
            'progress' => ReviewBuilder::for($round)->progress(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function boot(Authenticatable $user, string $page): array
    {
        return [
            'version' => AssetController::version(),
            'page' => $page,
            'brand' => (array) config('kradan.brand'),
            'theme' => $this->theme(),
            'locale' => (string) config('kradan.locale', 'th'),
            'user' => [...Kradan::present($user), 'can' => ['manage' => Kradan::allows($user, Ability::Manage), 'edit' => Kradan::allows($user, Ability::Edit)]],
            'csrf' => csrf_token(),
            'routes' => ['api' => url(trim((string) config('kradan.path'), '/').'/api'), 'index' => route('kradan.index')],
        ];
    }

    /**
     * @return array{name: string, tokens: object}
     */
    private function theme(): array
    {
        $theme = Theme::resolve();

        return ['name' => $theme['name'], 'tokens' => (object) $theme['tokens']];
    }

    /**
     * The round's threads plus every reply to an item on the board, since
     * items show in every round.
     *
     * @return list<array<string, mixed>>
     */
    private function comments(Round $round, Authenticatable $user): array
    {
        return Comment::query()
            ->whereNull('parent_id')
            ->where(fn ($query) => $query
                ->where(fn ($own) => $own->where('round_id', $round->id)->whereNull('item_id'))
                ->orWhereIn('item_id', Item::query()->select('id')->where('board_id', $round->board_id)))
            ->with('replies')
            ->oldest('id')
            ->get()
            ->map(fn (Comment $comment): array => $this->comment($comment, $user))
            ->values()
            ->all();
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
        $key = (string) config('broadcasting.connections.reverb.key');
        $browserDoor = (array) (collect((array) config('reverb.apps.apps', []))->firstWhere('key', $key)['options'] ?? []);
        $options = filled($browserDoor['host'] ?? null) ? $browserDoor : (array) config('broadcasting.connections.reverb.options', []);

        return [
            'key' => $key,
            'host' => (string) ($options['host'] ?? request()->getHost()),
            'port' => (int) ($options['port'] ?? 443),
            'scheme' => (string) ($options['scheme'] ?? 'https'),
        ];
    }
}
