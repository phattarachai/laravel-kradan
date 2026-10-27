<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Override;

/**
 * @property int $id
 * @property int $round_id
 * @property string $step_key
 * @property int|null $parent_id
 * @property string $user_id
 * @property string $body
 * @property array{option?: ?string, device?: ?string, src?: ?string, x?: float, y?: float, text?: ?string, box?: array{w?: float, h?: float, texts?: list<string>}|null}|null $pin
 * @property array{from: string, to: string}|null $edit
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 */
final class Comment extends KradanModel
{
    use SoftDeletes;

    protected $table = 'kradan_comments';

    /** @var list<string> */
    protected $fillable = ['round_id', 'step_key', 'parent_id', 'user_id', 'body', 'pin', 'edit'];

    /** @return BelongsTo<Round, $this> */
    public function round(): BelongsTo
    {
        return $this->belongsTo(Round::class);
    }

    /** @return HasMany<self, $this> */
    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->oldest('id');
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'pin' => 'array',
            'edit' => 'array',
        ];
    }
}
