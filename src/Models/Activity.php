<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Override;
use Phattarachai\Kradan\Enums\ActivityAction;

/**
 * @property int $id
 * @property int $board_id
 * @property int|null $round_id
 * @property string|null $user_id
 * @property ActivityAction $action
 * @property array<string, mixed>|null $meta
 * @property Carbon $created_at
 */
final class Activity extends KradanModel
{
    public const null UPDATED_AT = null;

    protected $table = 'kradan_activity';

    /** @var list<string> */
    protected $fillable = ['board_id', 'round_id', 'user_id', 'action', 'meta'];

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
            'action' => ActivityAction::class,
            'meta' => 'array',
        ];
    }
}
