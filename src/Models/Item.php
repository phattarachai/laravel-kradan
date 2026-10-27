<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Override;
use Phattarachai\Kradan\Enums\ItemKind;

/**
 * Something a user added to the board beside or over a frame: a note, text,
 * an image or file, or a drawing. It belongs to the board and the step key,
 * so it carries over to the next round while the step keeps its title.
 *
 * @property int $id
 * @property int $board_id
 * @property int|null $round_id
 * @property string $step_key
 * @property string $user_id
 * @property ItemKind $kind
 * @property array{option?: ?string, device?: ?string, src?: ?string, on?: bool}|null $anchor
 * @property float $x
 * @property float $y
 * @property float|null $w
 * @property float|null $h
 * @property string|null $color
 * @property string|null $text
 * @property list<array{0: float, 1: float}>|null $points
 * @property list<string>|null $texts
 * @property string|null $file_path
 * @property string|null $file_name
 * @property string|null $file_type
 * @property int|null $file_size
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property Carbon|null $deleted_at
 * @property-read Board $board
 * @property-read Round|null $round
 * @property-read int|null $replies_count
 */
final class Item extends KradanModel
{
    use SoftDeletes;

    protected $table = 'kradan_items';

    /** @var list<string> */
    protected $fillable = [
        'board_id', 'round_id', 'step_key', 'user_id', 'kind', 'anchor', 'x', 'y', 'w', 'h',
        'color', 'text', 'points', 'texts', 'file_path', 'file_name', 'file_type', 'file_size',
    ];

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

    /** @return HasMany<Comment, $this> */
    public function replies(): HasMany
    {
        return $this->hasMany(Comment::class, 'item_id')->oldest('id');
    }

    public function isImage(): bool
    {
        return $this->kind === ItemKind::Image;
    }

    /**
     * Where `kradan:pull` saves the upload, relative to the design folder.
     */
    public function localPath(): ?string
    {
        if ($this->file_name === null) {
            return null;
        }

        $name = trim((string) preg_replace('/[^\pL\pM\pN._-]+/u', '-', $this->file_name), '-.') ?: 'file';

        return "attachments/{$this->id}-{$name}";
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'kind' => ItemKind::class,
            'anchor' => 'array',
            'x' => 'float',
            'y' => 'float',
            'w' => 'float',
            'h' => 'float',
            'points' => 'array',
            'texts' => 'array',
            'file_size' => 'integer',
        ];
    }
}
