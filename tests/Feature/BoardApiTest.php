<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Http\Controllers\AssetController;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Activity;
use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Tests\Fixtures\User;

use function Pest\Laravel\actingAs;

const QUESTION = '|Block หรือเก็บไว้';
const SCREEN = 'หน้าจอ|หน้ายืนยัน';

function pickUrl(int $round = 1, string $step = QUESTION): string
{
    return '/kradan/api/boards/t188-manual-so/rounds/'.$round.'/picks/'.rawurlencode($step);
}

it('renders the board shell with the boot payload', function (): void {
    publishRound();

    $html = actingAs(kradanUser())->get('/kradan/t188-manual-so')->assertOk()->getContent();
    $boot = bootOf($html);

    expect($boot)->toHaveKeys(['version', 'page', 'brand', 'locale', 'user', 'csrf', 'routes', 'presence', 'board'])
        ->and($boot['page'])->toBe('board')
        ->and($boot['user'])->toMatchArray(['name' => 'สมชาย', 'avatar' => null, 'can' => ['manage' => true]])
        ->and($boot['routes'])->toBe(['api' => 'http://localhost/kradan/api', 'index' => 'http://localhost/kradan'])
        ->and($boot['presence']['mode'])->toBe('polling')
        ->and($boot['board'])->toMatchArray(['slug' => 't188-manual-so', 'status' => 'open', 'task_ref' => 'T188', 'url' => 'http://localhost/kradan/t188-manual-so', 'current' => 1, 'seen_prints' => null])
        ->and($boot['board'])->not->toHaveKeys(['kind', 'panel'])
        ->and($boot['board']['rounds'][0])->toHaveKeys(['number', 'title', 'pushed_at', 'steps', 'prints', 'base_url'])
        ->and(array_keys($boot['board']['rounds'][0]['prints']))->toBe([QUESTION, SCREEN])
        ->and($boot['board']['rounds'][0]['base_url'])->toStartWith('http://localhost/kradan/f/')
        ->and($html)->toContain('http://localhost/kradan/assets/board.js?v='.$boot['version']);
});

it('versions the board assets by the content of dist/, not only the package version', function (): void {
    $dist = dirname(__DIR__, 2).'/dist';
    $hash = substr(md5(md5_file("{$dist}/board.js").md5_file("{$dist}/board.css")), 0, 10);

    expect(AssetController::version())->toBe(Kradan::VERSION."-{$hash}");
});

it('renders the index shell with a row per board', function (): void {
    publishRound();

    $boot = bootOf(actingAs(kradanUser())->get('/kradan')->assertOk()->getContent());

    expect($boot['page'])->toBe('index')
        ->and($boot)->not->toHaveKey('board')
        ->and(array_keys($boot['index']))->toBe(['boards'])
        ->and($boot['index']['boards'][0])->toMatchArray([
            'slug' => 't188-manual-so', 'status' => 'open', 'task_ref' => 'T188',
            'url' => 'http://localhost/kradan/t188-manual-so', 'steps' => ['Block หรือเก็บไว้', 'หน้ายืนยัน'],
            'answered' => 0, 'viewers' => [], 'updated' => false, 'decided_at' => null,
        ])
        ->and($boot['index']['boards'][0])->not->toHaveKeys(['kind', 'panel'])
        ->and($boot['index']['boards'][0]['round'])->toMatchArray(['number' => 1, 'title' => 'Manual SO ก่อนยืนยัน รอบ 1']);
});

it('flags a board updated for a returning viewer whose seen prints differ, never on a first visit', function (): void {
    publishRound();
    $user = kradanUser();
    $row = fn (): array => actingAs($user)->getJson('/kradan/api/boards')->json('boards.0');

    expect($row()['updated'])->toBeFalse();

    $prints = actingAs($user)->getJson('/kradan/api/boards/t188-manual-so')->json('rounds.0.prints');
    actingAs($user)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['prints_seen' => $prints])->assertOk();

    expect($row()['updated'])->toBeFalse();

    publishRound(files: ['screen.html' => '<button>ส่ง</button>']);

    expect($row()['updated'])->toBeTrue();

    actingAs(kradanUser('วิภา'))->putJson(pickUrl(), ['options' => ['A']]);
    actingAs(kradanUser('ต้น'))->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => SCREEN, 'body' => 'ok']);

    expect($row()['answered'])->toBe(2);
});

it('saves a pick in option order, shows it to everyone, and clears it', function (): void {
    publishRound();
    $somchai = kradanUser('สมชาย');

    actingAs($somchai)->putJson(pickUrl(), ['options' => ['B', 'A']])
        ->assertOk()
        ->assertJsonPath('picks.0.options', ['A', 'B']);

    actingAs(kradanUser('นิดา'))->putJson(pickUrl(), ['options' => ['B']])
        ->assertOk()
        ->assertJsonCount(2, 'picks')
        ->assertJsonPath('picks.0.user.name', 'สมชาย')
        ->assertJsonPath('picks.1.user.name', 'นิดา')
        ->assertJsonPath('picks.1.step', QUESTION);

    actingAs(kradanUser('วิภา'))->getJson('/kradan/api/boards/t188-manual-so')
        ->assertOk()
        ->assertJsonPath('picks.0.user.name', 'สมชาย')
        ->assertJsonPath('picks.0.options', ['A', 'B'])
        ->assertJsonPath('progress.0.answered', 1)
        ->assertJsonPath('progress.0.total', 2);

    actingAs($somchai)->putJson(pickUrl(), ['options' => [], 'seen' => false])->assertOk()->assertJsonCount(1, 'picks');

    expect(Pick::query()->pluck('user_id')->all())->toBe([(string) User::query()->where('name', 'นิดา')->value('id')])
        ->and(Activity::query()->where('action', 'pick')->count())->toBe(3);
});

it('records ข้าม as seen with no options', function (): void {
    publishRound();

    actingAs(kradanUser())->putJson(pickUrl(), ['options' => [], 'seen' => true])
        ->assertOk()
        ->assertJsonPath('picks.0.seen', true)
        ->assertJsonPath('picks.0.options', []);
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
        ->assertCreated()->json('id');
    $reply = actingAs(kradanUser('สมชาย'))->postJson($url, ['step' => QUESTION, 'body' => 'เห็นด้วย', 'parent_id' => $parent])
        ->assertCreated()->json('id');

    actingAs($nida)->postJson($url, ['step' => QUESTION, 'body' => 'ลึกไป', 'parent_id' => $reply])->assertJsonValidationErrors('parent_id');
    actingAs($nida)->postJson($url, ['step' => SCREEN, 'body' => 'ผิดข้อ', 'parent_id' => $parent])->assertJsonValidationErrors('parent_id');

    $pin = ['option' => null, 'device' => 'desktop', 'src' => 'screen.html#s=1', 'x' => 120, 'y' => 340, 'text' => 'ยืนยัน', 'box' => ['w' => 200, 'h' => 80, 'texts' => ['ยืนยัน', 'ยกเลิก']]];
    $pinned = actingAs($nida)->postJson($url, ['step' => SCREEN, 'body' => 'สีแดง', 'pin' => $pin])
        ->assertCreated()->assertJsonPath('replies', []);

    expect($pinned->json('pin'))->toEqual($pin);
    actingAs($nida)->postJson($url, ['step' => QUESTION, 'body' => null, 'edit' => ['from' => 'ส่ง', 'to' => 'ยืนยัน'], 'pin' => ['option' => 'A', 'device' => 'phone', 'src' => 'crop', 'x' => 0, 'y' => 0]])
        ->assertCreated()->assertJsonPath('body', '')->assertJsonPath('pin.src', 'crop');
    actingAs($nida)->postJson($url, ['step' => QUESTION, 'body' => ''])->assertJsonValidationErrors('body');

    actingAs($nida)->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonCount(3, 'comments')
        ->assertJsonPath('comments.0.replies.0.body', 'เห็นด้วย')
        ->assertJsonPath('comments.0.mine', true)
        ->assertJsonPath('comments.0.replies.0.mine', false)
        ->assertJsonMissingPath('comments.0.replies.0.replies');

    expect(Activity::query()->pluck('action')->map->value->countBy()->all())
        ->toMatchArray(['comment' => 2, 'pin' => 1, 'edit' => 1]);
});

it('lets only the author edit or delete a comment', function (): void {
    publishRound();
    $author = kradanUser('นิดา');
    $id = actingAs($author)->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => QUESTION, 'body' => 'เดิม'])->json('id');

    actingAs(kradanUser('สมชาย'))->patchJson("/kradan/api/comments/{$id}", ['body' => 'แก้'])->assertForbidden();
    actingAs(kradanUser('สมชาย'))->deleteJson("/kradan/api/comments/{$id}")->assertForbidden();

    actingAs($author)->patchJson("/kradan/api/comments/{$id}", ['body' => 'แก้แล้ว'])->assertOk()->assertJsonPath('body', 'แก้แล้ว');
    actingAs($author)->deleteJson("/kradan/api/comments/{$id}")->assertNoContent();

    expect(Comment::query()->count())->toBe(0)
        ->and(Comment::withTrashed()->count())->toBe(1);
});

it('lists viewers of the last 15 minutes on heartbeat, and merges the prints each has seen', function (): void {
    publishRound();
    $somchai = kradanUser('สมชาย');
    $wipa = kradanUser('วิภา');
    $ton = kradanUser('ต้น');

    actingAs($ton)->postJson('/kradan/api/boards/t188-manual-so/heartbeat')->assertOk();
    Date::setTestNow(Date::now()->addMinutes(11));
    actingAs($wipa)->postJson('/kradan/api/boards/t188-manual-so/heartbeat')->assertOk();
    Date::setTestNow(Date::now()->addMinutes(5));

    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['round' => 1, 'prints_seen' => [QUESTION => 'abc']])
        ->assertOk()
        ->assertJsonCount(2, 'viewers')
        ->assertJsonPath('viewers.0.user.name', 'สมชาย')
        ->assertJsonPath('viewers.0.active', true)
        ->assertJsonPath('viewers.1.user.name', 'วิภา')
        ->assertJsonPath('viewers.1.active', false);

    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['prints_seen' => [SCREEN => 'def']]);
    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/heartbeat', ['prints_seen' => [QUESTION => 'xyz']]);

    actingAs($somchai)->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonPath('seen_prints', [QUESTION => 'xyz', SCREEN => 'def']);
});

it('answers ?round=N with the same shape for that round', function (): void {
    publishRound();
    publishRound(title: 'Manual SO ก่อนยืนยัน รอบ 2');
    $user = kradanUser();
    actingAs($user)->putJson(pickUrl(2), ['options' => ['A']]);

    actingAs($user)->getJson('/kradan/api/boards/t188-manual-so')->assertJsonPath('current', 2)->assertJsonCount(1, 'picks');
    actingAs($user)->getJson('/kradan/api/boards/t188-manual-so?round=1')->assertJsonPath('current', 1)->assertJsonCount(0, 'picks')->assertJsonCount(2, 'rounds');
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
    publishRound('t185-cover', 'Cover ใบลา', taskRef: 'T185');
    $user = kradanUser();

    $search = fn (string $q): array => array_column(actingAs($user)->getJson('/kradan/api/boards?q='.urlencode($q))->json('boards'), 'slug');

    expect($search('manual'))->toBe(['t188-manual-so'])
        ->and($search('T185'))->toBe(['t185-cover'])
        ->and($search('หน้ายืนยัน'))->toEqualCanonicalizing(['t188-manual-so', 't185-cover'])
        ->and($search(''))->toHaveCount(2);

    actingAs($user)->get('/kradan')->assertOk()->assertSee('t188-manual-so');
});
