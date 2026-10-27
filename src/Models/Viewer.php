<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Override;

/**
 * @property int $id
 * @property int $board_id
 * @property string $user_id
 * @property Carbon $last_seen_at
 * @property array<string, string>|null $seen_prints
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
final class Viewer extends KradanModel
{
    protected $table = 'kradan_viewers';

    /** @var list<string> */
    protected $fillable = ['board_id', 'user_id', 'last_seen_at', 'seen_prints'];

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'seen_prints' => 'array',
        ];
    }
}
