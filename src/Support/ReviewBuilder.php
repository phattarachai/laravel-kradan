<?php

declare(strict_types=1);

namespace Phattarachai\Kradan\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Models\Round;

/**
 * Every answer on one round, as the `review.md` text the board copies for
 * Claude and as the `review.json` that `kradan:pull` files next to it.
 *
 * @see 1-architecture.md "review.md shape"
 */
final class ReviewBuilder
{
    private const string INDENT = '   ';

    /** @var Collection<int, Pick> */
    private Collection $picks;

    /** @var Collection<int, Comment> */
    private Collection $comments;

    /** @var array<int, int> comment id => pin number */
    private array $pinNumbers = [];

    public function __construct(private readonly Board $board, private readonly Round $round)
    {
        $this->picks = $round->picks()->oldest('id')->get();
        $this->comments = $round->comments()->whereNull('parent_id')->with('replies')->oldest('id')->get();
        $this->pinNumbers = $this->numberPins();
    }

    public static function for(Round $round): self
    {
        return new self($round->board, $round);
    }

    public function markdown(): string
    {
        $lines = [$this->header(), ''];
        $group = '';

        foreach ($this->round->steps as $index => $step) {
            if ($step['group'] !== '' && $step['group'] !== $group) {
                if (end($lines) !== '') {
                    $lines[] = '';
                }

                $lines[] = $step['group'];
            }

            $group = $step['group'];
            $answer = $this->answer($step);
            $lines[] = ($index + 1).". {$step['title']}".($answer === '' ? '' : " → {$answer}");
            array_push($lines, ...$this->details($step['key']));
        }

        return implode("\n", $lines)."\n";
    }

    /**
     * @return array<string, mixed>
     */
    public function json(): array
    {
        return [
            'source' => 'kradan',
            'slug' => $this->board->slug,
            'page' => $this->board->url(),
            'board' => $this->board->title,
            'task_ref' => $this->board->task_ref,
            'status' => $this->board->status->value,
            'title' => $this->round->title,
            'round' => $this->round->number,
            'pushed_at' => $this->round->pushed_at->toIso8601String(),
            'sent' => true,
            'savedAt' => Date::now()->toIso8601String(),
            'text' => $this->markdown(),
            'steps' => array_map($this->jsonStep(...), $this->round->steps, array_keys($this->round->steps)),
            'missing' => $this->missing(),
            'progress' => $this->progress(),
        ];
    }

    /**
     * How far each person got: steps with a pick, a ข้าม/อ่านแล้ว tick or a comment.
     *
     * @return list<array{user: array{id: mixed, name: string, avatar: ?string}, answered: int, total: int}>
     */
    public function progress(): array
    {
        $answered = [];

        foreach ($this->picks as $pick) {
            $answered[$pick->user_id][$pick->step_key] = true;
        }

        foreach ($this->comments as $comment) {
            $answered[$comment->user_id][$comment->step_key] = true;
        }

        return array_map(fn (string $userId): array => [
            'user' => Kradan::userById($userId),
            'answered' => count(array_intersect_key($answered[$userId], array_flip(array_column($this->round->steps, 'key')))),
            'total' => count($this->round->steps),
        ], array_map(strval(...), array_keys($answered)));
    }

    private function header(): string
    {
        $title = trim("{$this->board->task_ref} {$this->board->title}");

        return implode(' · ', [$title, Kradan::trans('round', ['number' => $this->round->number]), $this->board->url()]);
    }

    /**
     * @param  array{key: string, kind: string, options: list<array{key: string, title: string}>}  $step
     */
    private function answer(array $step): string
    {
        $picks = $this->picks->where('step_key', $step['key']);
        $seen = $this->names($picks->filter(fn (Pick $pick): bool => $pick->seen && $pick->options === []));

        if ($step['kind'] === 'screen') {
            return $seen === [] ? '' : Kradan::trans('read').': '.implode(', ', $seen);
        }

        $parts = collect($step['options'])
            ->map(fn (array $option): array => [$option['key'], $this->names($picks->filter(fn (Pick $pick): bool => in_array($option['key'], $pick->options, strict: true)))])
            ->filter(fn (array $part): bool => $part[1] !== [])
            ->map(fn (array $part): string => "{$part[0]}: ".implode(', ', $part[1]))
            ->when($seen !== [], fn (Collection $parts): Collection => $parts->push(Kradan::trans('skip').': '.implode(', ', $seen)));

        return $parts->isEmpty() ? Kradan::trans('no_answer') : $parts->implode(' · ');
    }

    /**
     * @return list<string>
     */
    private function details(string $stepKey): array
    {
        return $this->comments
            ->where('step_key', $stepKey)
            ->flatMap(fn (Comment $comment): array => [
                ...$this->block(self::INDENT, $this->commentLine($comment)),
                ...$comment->replies->flatMap(fn (Comment $reply): array => $this->block(self::INDENT.self::INDENT, '↳ '.$this->name($reply->user_id).": {$reply->body}")),
            ])
            ->values()
            ->all();
    }

    private function commentLine(Comment $comment): string
    {
        $name = $this->name($comment->user_id);

        if ($comment->edit !== null) {
            $where = $this->where($comment->pin['option'] ?? null);
            $body = trim($comment->body) === '' ? '' : ": {$comment->body}";

            return "✎ {$name}{$where}: “{$comment->edit['from']}” → “{$comment->edit['to']}”{$body}";
        }

        if ($comment->pin !== null) {
            $mark = ($comment->pin['box'] ?? null) ? '▭' : '📍';
            $where = $this->where($comment->pin['option'] ?? null, $comment->pin['device'] ?? null);
            $texts = $this->quoted($comment->pin['text'] ?? null);

            return "{$mark}{$this->pinNumbers[$comment->id]} {$name}{$where}{$texts}: {$comment->body}";
        }

        return "💬 {$name}: {$comment->body}";
    }

    /**
     * @return list<string>
     */
    private function block(string $indent, string $text): array
    {
        $lines = explode("\n", trim(str_replace("\r\n", "\n", $text)));

        return array_map(fn (string $line, int $i): string => $indent.($i === 0 ? '' : '  ').$line, $lines, array_keys($lines));
    }

    private function where(?string ...$parts): string
    {
        $parts = array_filter($parts, fn (?string $part): bool => $part !== null && $part !== '');

        return $parts === [] ? '' : ' ('.implode(', ', $parts).')';
    }

    private function quoted(mixed $text): string
    {
        $texts = array_filter(array_map(trim(...), array_map(strval(...), (array) $text)), fn (string $t): bool => $t !== '');

        return $texts === [] ? '' : ' '.implode(', ', array_map(fn (string $t): string => "“{$t}”", $texts));
    }

    /**
     * @return array<int, int>
     */
    private function numberPins(): array
    {
        return $this->comments
            ->filter(fn (Comment $comment): bool => $comment->pin !== null && $comment->edit === null)
            ->values()
            ->mapWithKeys(fn (Comment $comment, int $i): array => [$comment->id => $i + 1])
            ->all();
    }

    /**
     * @param  Collection<int, Pick>  $picks
     * @return list<string>
     */
    private function names(Collection $picks): array
    {
        return $picks->map(fn (Pick $pick): string => $this->name($pick->user_id))->values()->all();
    }

    private function name(?string $userId): string
    {
        return Kradan::userById($userId)['name'];
    }

    /**
     * @param  array{key: string, group: string, title: string, kind: string, options: list<array{key: string, title: string}>}  $step
     * @return array<string, mixed>
     */
    private function jsonStep(array $step, int $index): array
    {
        $picks = $this->picks->where('step_key', $step['key']);
        $comments = $this->comments->where('step_key', $step['key']);

        return [
            'n' => $index + 1,
            'key' => $step['key'],
            'group' => $step['group'],
            'title' => $step['title'],
            'kind' => $step['kind'],
            'options' => array_column($step['options'], 'key'),
            'answer' => $this->answer($step),
            'picks' => $picks->flatMap(fn (Pick $pick): array => $pick->options)->unique()->values()->all(),
            'by' => $picks->values()->map(fn (Pick $pick): array => ['user' => $this->name($pick->user_id), 'options' => $pick->options, 'seen' => $pick->seen])->all(),
            'seen' => $picks->contains(fn (Pick $pick): bool => $pick->seen),
            'note' => '',
            'comments' => $comments->whereNull('pin')->whereNull('edit')->values()->map($this->jsonComment(...))->all(),
            'pins' => $comments->filter(fn (Comment $c): bool => $c->pin !== null && $c->edit === null)->values()->map(fn (Comment $c): array => [...$this->jsonComment($c), 'no' => $this->pinNumbers[$c->id]])->all(),
            'edits' => $comments->filter(fn (Comment $c): bool => $c->edit !== null)->values()->map($this->jsonComment(...))->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonComment(Comment $comment): array
    {
        return [
            'id' => $comment->id,
            'user' => $this->name($comment->user_id),
            'body' => $comment->body,
            'pin' => $comment->pin,
            'edit' => $comment->edit,
            'at' => $comment->created_at?->toIso8601String(),
            'replies' => $comment->replies->map(fn (Comment $reply): array => [
                'id' => $reply->id,
                'user' => $this->name($reply->user_id),
                'body' => $reply->body,
                'at' => $reply->created_at?->toIso8601String(),
            ])->all(),
        ];
    }

    /**
     * @return list<int>
     */
    private function missing(): array
    {
        $answered = $this->picks->pluck('step_key')->merge($this->comments->pluck('step_key'))->unique()->all();
        $missing = [];

        foreach ($this->round->steps as $index => $step) {
            if (! in_array($step['key'], $answered, strict: true)) {
                $missing[] = $index + 1;
            }
        }

        return $missing;
    }
}
