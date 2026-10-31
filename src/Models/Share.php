<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Date;
use Override;

/**
 * A public, present-only link to a deck. Only the sha256 of its token is stored; the token itself is shown
 * once, when the link is made. `round_id` null follows the latest round.
 *
 * @property int $id
 * @property int $board_id
 * @property int|null $round_id
 * @property string $token_hash
 * @property Carbon|null $expires_at
 * @property Carbon|null $revoked_at
 * @property string|null $created_by
 * @property Carbon|null $last_used_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Board $board
 * @property-read Round|null $round
 */
final class Share extends KradanModel
{
    protected $table = 'kradan_shares';

    /** @var list<string> */
    protected $fillable = ['board_id', 'round_id', 'token_hash', 'expires_at', 'revoked_at', 'created_by', 'last_used_at'];

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @return BelongsTo<Round, $this> */
    public function round(): BelongsTo
    {
        return $this->belongsTo(Round::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null && ($this->expires_at === null || $this->expires_at->isFuture());
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    public function touchUsed(): void
    {
        if ($this->last_used_at === null || $this->last_used_at->lt(Date::now()->subMinutes(5))) {
            $this->forceFill(['last_used_at' => Date::now()])->saveQuietly();
        }
    }
}
