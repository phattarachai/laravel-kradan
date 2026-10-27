<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Models\Activity;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Pick;

use function Pest\Laravel\actingAs;

const QUESTION = '|Block หรือเก็บไว้';
const SCREEN = 'หน้าจอ|หน้ายืนยัน';

function pickUrl(int $round = 1, string $step = QUESTION): string
{
    return '/kradan/api/boards/t188-manual-so/rounds/'.$round.'/picks/'.rawurlencode($step);
}

it('renders the board shell with the boot payload', function (): void {
    publishRound();

    $html = actingAs(kradanUser())->get('/kradan/decisions/t188-manual-so')->assertOk()->getContent();
    preg_match('#window\.Kradan = (.*?);</script>#s', $html, $match);
    $boot = json_decode($match[1], true);

    expect($boot)->toHaveKeys(['version', 'brand', 'locale', 'user', 'csrf', 'routes', 'presence', 'board'])
        ->and($boot['user'])->toMatchArray(['name' => 'สมชาย', 'avatar' => null, 'can' => ['manage' => true]])
        ->and($boot['routes'])->toBe(['api' => 'http://localhost/kradan/api', 'index' => 'http://localhost/kradan'])
        ->and($boot['presence']['mode'])->toBe('polling')
        ->and($boot['board'])->toMatchArray(['slug' => 't188-manual-so', 'kind' => 'decision', 'status' => 'open', 'task_ref' => 'T188', 'current' => 1])
        ->and($boot['board']['rounds'][0]['base_url'])->toStartWith('http://localhost/kradan/f/')
        ->and($html)->toContain('/kradan/assets/board.js?v=');
});

it('saves a pick in option order, shows it to everyone, and clears it', function (): void {
    publishRound();
    $somchai = kradanUser('สมชาย');

    actingAs($somchai)->putJson(pickUrl(), ['options' => ['B', 'A']])
        ->assertOk()
        ->assertJsonPath('pick.options', ['A', 'B']);

    actingAs(kradanUser('วิภา'))->getJson('/kradan/api/boards/t188-manual-so')
        ->assertOk()
        ->assertJsonPath('picks.0.user.name', 'สมชาย')
        ->assertJsonPath('picks.0.options', ['A', 'B'])
        ->assertJsonPath('progress.0.answered', 1)
        ->assertJsonPath('progress.0.total', 2);

    actingAs($somchai)->putJson(pickUrl(), ['options' => []])->assertOk()->assertJsonPath('pick', null);

    expect(Pick::query()->count())->toBe(0)
        ->and(Activity::query()->where('action', 'pick')->count())->toBe(1);
});

it('records ข้าม as seen with no options', function (): void {
    publishRound();

    actingAs(kradanUser())->putJson(pickUrl(), ['options' => [], 'seen' => true])
        ->assertOk()
        ->assertJsonPath('pick.seen', true);
});

it('refuses an unknown step or option', function (): void {
    publishRound();

    actingAs(kradanUser())->putJson(pickUrl(step: 'nope'), ['options' => ['A']])->assertJsonValidationErrors('step');
    actingAs(kradanUser())->putJson(pickUrl(), ['options' => ['Z']])->assertJsonValidationErrors('options');
});

it('keeps older rounds read-only and locks picks once decided, while comments stay open', function (): void {
    publishRound();
    $round = publishRound(title: 'Manual SO ก่อนยืนยัน รอบ 2');
    $user = kradanUser();

    actingAs($user)->putJson(pickUrl(1), ['options' => ['A']])->assertStatus(409);
    actingAs($user)->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => QUESTION, 'body' => 'x'])->assertStatus(409);

    actingAs($user)->postJson('/kradan/api/boards/t188-manual-so/decide')->assertOk();

    actingAs($user)->putJson(pickUrl(2), ['options' => ['A']])->assertStatus(409);
    actingAs($user)->postJson('/kradan/api/boards/t188-manual-so/rounds/2/comments', ['step' => QUESTION, 'body' => 'ยังคุยต่อได้'])->assertCreated();

    expect($round->number)->toBe(2);
});

it('threads comments one level deep, with pins and edits', function (): void {
    publishRound();
    $nida = kradanUser('นิดา');
    $url = '/kradan/api/boards/t188-manual-so/rounds/1/comments';

    $parent = actingAs($nida)->postJson($url, ['step' => QUESTION, 'body' => 'ถ้า block ต้องมีทางให้ sales แก้เอง'])
        ->assertCreated()->json('comment.id');
    $reply = actingAs(kradanUser('สมชาย'))->postJson($url, ['step' => QUESTION, 'body' => 'เห็นด้วย', 'parent_id' => $parent])
        ->assertCreated()->json('comment.id');

    actingAs($nida)->postJson($url, ['step' => QUESTION, 'body' => 'ลึกไป', 'parent_id' => $reply])->assertJsonValidationErrors('parent_id');
    actingAs($nida)->postJson($url, ['step' => SCREEN, 'body' => 'ผิดข้อ', 'parent_id' => $parent])->assertJsonValidationErrors('parent_id');

    actingAs($nida)->postJson($url, ['step' => SCREEN, 'body' => 'สีแดง', 'pin' => ['option' => null, 'device' => 'desktop', 'x' => 0.4, 'y' => 0.2, 'text' => 'ยืนยัน']])
        ->assertCreated()->assertJsonPath('comment.pin.text', 'ยืนยัน');
    actingAs($nida)->postJson($url, ['step' => QUESTION, 'edit' => ['from' => 'ส่ง', 'to' => 'ยืนยัน']])
        ->assertCreated()->assertJsonPath('comment.body', '');

    actingAs($nida)->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonCount(3, 'comments')
        ->assertJsonPath('comments.0.replies.0.body', 'เห็นด้วย')
        ->assertJsonPath('comments.0.mine', true)
        ->assertJsonPath('comments.0.replies.0.mine', false);

    expect(Activity::query()->pluck('action')->map->value->countBy()->all())
        ->toMatchArray(['comment' => 2, 'pin' => 1, 'edit' => 1]);
});

it('lets only the author edit or delete a comment', function (): void {
    publishRound();
    $author = kradanUser('นิดา');
    $id = actingAs($author)->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => QUESTION, 'body' => 'เดิม'])->json('comment.id');

    actingAs(kradanUser('สมชาย'))->patchJson("/kradan/api/comments/{$id}", ['body' => 'แก้'])->assertForbidden();
    actingAs(kradanUser('สมชาย'))->deleteJson("/kradan/api/comments/{$id}")->assertForbidden();

    actingAs($author)->patchJson("/kradan/api/comments/{$id}", ['body' => 'แก้แล้ว'])->assertOk()->assertJsonPath('comment.body', 'แก้แล้ว');
    actingAs($author)->deleteJson("/kradan/api/comments/{$id}")->assertNoContent();

    expect(Comment::query()->count())->toBe(0)
        ->and(Comment::withTrashed()->count())->toBe(1);
});

it('tracks viewers on heartbeat: active, recent, and the prints each has seen', function (): void {
    publishRound();
    $somchai = kradanUser('สมชาย');
    $wipa = kradanUser('วิภา');

    actingAs($wipa)->postJson('/kradan/api/boards/t188-manual-so/heartbeat')->assertOk();
    Date::setTestNow(Date::now()->addMinutes(5));

    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['round' => 1, 'prints_seen' => [QUESTION => 'abc']])
        ->assertOk()
        ->assertJsonPath('viewers.0.user.name', 'สมชาย')
        ->assertJsonPath('viewers.0.active', true)
        ->assertJsonPath('viewers.1.user.name', 'วิภา')
        ->assertJsonPath('viewers.1.active', false)
        ->assertJsonPath('viewers.1.recent', true);

    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['prints_seen' => [SCREEN => 'def']]);

    actingAs($somchai)->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonPath('seen_prints', [QUESTION => 'abc', SCREEN => 'def']);
});

it('logs a view at most once per user, per board, per 30 minutes', function (): void {
    publishRound();
    $user = kradanUser();
    $beat = fn () => actingAs($user)->postJson('/kradan/api/boards/t188-manual-so/heartbeat')->assertOk();

    $beat();
    Date::setTestNow(Date::now()->addMinutes(10));
    $beat();
    Date::setTestNow(Date::now()->addMinutes(19));
    $beat();

    expect(Activity::query()->where('action', 'view')->count())->toBe(1);

    Date::setTestNow(Date::now()->addMinutes(2));
    $beat();
    actingAs(kradanUser('วิภา'))->postJson('/kradan/api/boards/t188-manual-so/heartbeat');

    expect(Activity::query()->where('action', 'view')->count())->toBe(3);
});

it('searches the index over title, task ref and step titles', function (): void {
    publishRound();
    publishRound('cover-flow', 'Cover flow', taskRef: 'T185');
    $user = kradanUser();

    $search = fn (string $q): array => array_column(actingAs($user)->getJson('/kradan/api/boards?q='.urlencode($q))->json('boards'), 'slug');

    expect($search('manual'))->toBe(['t188-manual-so'])
        ->and($search('T185'))->toBe(['cover-flow'])
        ->and($search('หน้ายืนยัน'))->toEqualCanonicalizing(['t188-manual-so', 'cover-flow'])
        ->and($search(''))->toHaveCount(2);

    actingAs($user)->get('/kradan')->assertOk()->assertSee('t188-manual-so');
});
