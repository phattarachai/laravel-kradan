<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Override;

/**
 * @property int $id
 * @property int $round_id
 * @property string $step_key
 * @property string $user_id
 * @property list<string> $options
 * @property bool $seen
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
final class Pick extends KradanModel
{
    protected $table = 'kradan_picks';

    /** @var list<string> */
    protected $fillable = ['round_id', 'step_key', 'user_id', 'options', 'seen'];

    /** @return BelongsTo<Round, $this> */
    public function round(): BelongsTo
    {
        return $this->belongsTo(Round::class);
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'options' => 'array',
            'seen' => 'boolean',
        ];
    }
}
