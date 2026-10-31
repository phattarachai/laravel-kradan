<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Facades\Date;
use Illuminate\Support\Str;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Models\Share;

/**
 * Public, present-only links to a deck at `/kradan/p/{token}`. The token is random and shown once; the table
 * keeps its sha256. A link follows the latest round unless it pins one, and stops working when it expires or
 * is revoked.
 */
final readonly class ShareLinks
{
    public const int DEFAULT_DAYS = 14;

    /**
     * @return array{share: Share, token: string, url: string}
     */
    public function create(Board $board, ?int $roundNumber = null, ?int $days = self::DEFAULT_DAYS, ?string $userId = null): array
    {
        abort_unless($board->isDeck(), 422, Kradan::trans('share_not_deck'));

        $round = $roundNumber === null ? null : $board->rounds()->where('number', $roundNumber)->firstOrFail();
        $token = Str::random(48);

        $share = Share::query()->create([
            'board_id' => $board->id,
            'round_id' => $round?->id,
            'token_hash' => Share::hash($token),
            'expires_at' => $days === null || $days <= 0 ? null : Date::now()->addDays($days),
            'created_by' => $userId,
        ])->setRelation('board', $board)->setRelation('round', $round);

        return ['share' => $share, 'token' => $token, 'url' => self::url($token)];
    }

    /**
     * The active share behind a token, or null for one that is unknown, expired, revoked, or whose deck has no
     * round to show.
     */
    public function find(string $token): ?Share
    {
        $share = Share::query()->with(['board', 'round'])->where('token_hash', Share::hash($token))->first();

        if (! $share instanceof Share || ! $share->isActive() || ! $share->board->isDeck()) {
            return null;
        }

        return $this->round($share) instanceof Round ? $share : null;
    }

    public function round(Share $share): ?Round
    {
        $round = $share->round ?? $share->board->latestRound()->first();

        return $round?->setRelation('board', $share->board);
    }

    public function revoke(Share $share): Share
    {
        if ($share->revoked_at === null) {
            $share->update(['revoked_at' => Date::now()]);
        }

        return $share;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function list(Board $board): array
    {
        return $board->shares()->with('round')->latest('id')->get()
            ->map(fn (Share $share): array => $this->present($share))
            ->values()
            ->all();
    }

    /**
     * A share without its token: the token can't be shown again.
     *
     * @return array<string, mixed>
     */
    public function present(Share $share, ?string $token = null): array
    {
        return [
            'id' => $share->id,
            'round' => $share->round?->number,
            'expires_at' => $share->expires_at?->toIso8601String(),
            'revoked_at' => $share->revoked_at?->toIso8601String(),
            'active' => $share->isActive(),
            'created_by' => Kradan::userById($share->created_by),
            'created_at' => $share->created_at?->toIso8601String(),
            'last_used_at' => $share->last_used_at?->toIso8601String(),
            ...($token === null ? [] : ['url' => self::url($token)]),
        ];
    }

    public static function url(string $token): string
    {
        return route('kradan.share', ['token' => $token]);
    }
}
