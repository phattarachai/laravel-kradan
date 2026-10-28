<?php

declare(strict_types=1);

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ReviewBuilder;

/**
 * Seeds tests/Fixtures/export/board.json, the round both ReviewBuilder and
 * the board's export.js print, and returns round 2. Rounds 1 and 3 exist so
 * items can carry over from round 1 and stay out from round 3.
 *
 * @param  array<string, mixed>  $fixture
 */
function seedExportFixture(array $fixture): Round
{
    foreach ($fixture['users'] as $user) {
        kradanUser($user['name']);
    }

    $board = Board::query()->create(['slug' => $fixture['board']['slug'], 'title' => $fixture['board']['title'], 'task_ref' => $fixture['board']['task_ref']]);
    $rounds = [];

    foreach ([1, 2, 3] as $number) {
        $rounds[$number] = Round::query()->create([
            'board_id' => $board->id,
            'number' => $number,
            'title' => $number === $fixture['round']['number'] ? $fixture['round']['title'] : "{$fixture['board']['title']} รอบ {$number}",
            'steps' => $fixture['round']['steps'],
            'prints' => [],
            'pushed_at' => Date::parse('2026-10-28 08:00:00'),
        ]);
    }

    $round = $rounds[$fixture['round']['number']];
    $at = fn (string $time): array => ['created_at' => Date::parse($time)->utc(), 'updated_at' => Date::parse($time)->utc()];
    $save = function (Model $model, array $attributes): void {
        $model->forceFill($attributes)->save();
    };

    foreach ($fixture['picks'] as $pick) {
        $save(new Pick, ['round_id' => $round->id, 'step_key' => $pick['step'], 'user_id' => (string) $pick['user']['id'], 'options' => $pick['options'], 'seen' => $pick['seen']]);
    }

    $comments = collect($fixture['comments'])
        ->flatMap(fn (array $comment): array => [$comment, ...$comment['replies'] ?? []])
        ->sortBy('id');

    foreach ($fixture['items'] as $item) {
        $save(new Item, [
            'id' => $item['id'],
            'board_id' => $board->id,
            'round_id' => $rounds[$item['round']]->id,
            'step_key' => $item['step'],
            'user_id' => (string) $item['user']['id'],
            'kind' => $item['kind'],
            'anchor' => $item['anchor'],
            'x' => $item['x'],
            'y' => $item['y'],
            'w' => $item['w'] ?? null,
            'h' => $item['h'] ?? null,
            'color' => $item['color'] ?? null,
            'text' => $item['text'] ?? null,
            'points' => $item['points'] ?? null,
            'texts' => $item['texts'] ?? null,
            'file_path' => isset($item['file']) ? "kradan/{$board->slug}/attachments/{$item['id']}" : null,
            'file_name' => $item['file']['name'] ?? null,
            'file_type' => $item['file']['type'] ?? null,
            'file_size' => $item['file']['size'] ?? null,
            ...$at($item['created_at']),
        ]);
    }

    foreach ($comments as $comment) {
        $save(new Comment, [
            'id' => $comment['id'],
            'round_id' => $round->id,
            'step_key' => $comment['step'],
            'parent_id' => $comment['parent_id'],
            'item_id' => $comment['item_id'],
            'user_id' => (string) $comment['user']['id'],
            'body' => $comment['body'],
            'pin' => $comment['pin'],
            'edit' => $comment['edit'],
            ...$at($comment['created_at']),
        ]);
    }

    return $round;
}

it('prints the shared export fixture line for line, as the board does', function (): void {
    $dir = __DIR__.'/../Fixtures/export';
    $fixture = json_decode((string) file_get_contents("{$dir}/board.json"), true, flags: JSON_THROW_ON_ERROR);
    $expected = explode("\n", (string) file_get_contents("{$dir}/review.md"));

    $actual = explode("\n", ReviewBuilder::for(seedExportFixture($fixture))->markdown());

    foreach ($expected as $i => $line) {
        expect($actual[$i] ?? null)->toBe($line, 'review.md line '.($i + 1));
    }

    expect($actual)->toHaveCount(count($expected));
});
