<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Override;
use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Enums\BoardStatus;
use Phattarachai\Kradan\Kradan;

/**
 * @property int $id
 * @property string $slug
 * @property string $title
 * @property BoardKind $kind
 * @property string|null $task_ref
 * @property BoardStatus $status
 * @property Carbon|null $decided_at
 * @property string|null $decided_by
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read Round|null $latestRound
 */
final class Board extends KradanModel
{
    protected $table = 'kradan_boards';

    /** @var list<string> */
    protected $fillable = ['slug', 'title', 'kind', 'task_ref', 'status', 'decided_at', 'decided_by'];

    /** @return HasMany<Round, $this> */
    public function rounds(): HasMany
    {
        return $this->hasMany(Round::class)->orderBy('number');
    }

    /** @return HasOne<Round, $this> */
    public function latestRound(): HasOne
    {
        return $this->hasOne(Round::class)->ofMany('number', 'max');
    }

    /** @return HasMany<Viewer, $this> */
    public function viewers(): HasMany
    {
        return $this->hasMany(Viewer::class);
    }

    /** @return HasMany<Activity, $this> */
    public function activity(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function panel(): string
    {
        return Kradan::panelFor($this->kind);
    }

    /**
     * "T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ": the task ref before the title, unless
     * the title already starts with it.
     */
    public function label(): string
    {
        return self::labelFor($this->task_ref, $this->title);
    }

    public static function labelFor(?string $taskRef, string $title): string
    {
        $ref = trim((string) $taskRef);

        if ($ref === '' || preg_match('/^'.preg_quote($ref, '/').'(?![\pL\pN])/iu', ltrim($title)) === 1) {
            return trim($title);
        }

        return "{$ref} ".trim($title);
    }

    public function isOpen(): bool
    {
        return $this->status === BoardStatus::Open;
    }

    public function url(): string
    {
        return route('kradan.board', ['panel' => $this->panel(), 'slug' => $this->slug]);
    }

    /** @return array<string, string> */
    #[Override]
    protected function casts(): array
    {
        return [
            'kind' => BoardKind::class,
            'status' => BoardStatus::class,
            'decided_at' => 'datetime',
        ];
    }
}
