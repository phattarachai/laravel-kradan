<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Override;

/**
 * @property int $id
 * @property int $board_id
 * @property int $number
 * @property string $title
 * @property list<array{key: string, group: string, title: string, sub: string, kind: string, options: list<array{key: string, title: string}>}> $steps
 * @property array<string, string> $prints
 * @property Carbon $pushed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Board $board
 */
final class Round extends KradanModel
{
    protected $table = 'kradan_rounds';

    /** @var list<string> */
    protected $fillable = ['board_id', 'number', 'title', 'steps', 'prints', 'pushed_at'];

    /** @return BelongsTo<Board, $this> */
    public function board(): BelongsTo
    {
        return $this->belongsTo(Board::class);
    }

    /** @return HasMany<Pick, $this> */
    public function picks(): HasMany
    {
        return $this->hasMany(Pick::class);
    }

    /** @return HasMany<Comment, $this> */
    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }

    public function directory(): string
    {
        return "kradan/{$this->board->slug}/{$this->number}";
    }

    /** @return array{key: string, group: string, title: string, sub: string, kind: string, options: list<array{key: string, title: string}>}|null */
    public function step(string $key): ?array
    {
        return collect($this->steps)->firstWhere('key', $key);
    }

    public function isLatest(): bool
    {
        return ! self::query()
            ->where('board_id', $this->board_id)
            ->where('number', '>', $this->number)
            ->exists();
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'number' => 'integer',
            'steps' => 'array',
            'prints' => 'array',
            'pushed_at' => 'datetime',
        ];
    }
}
