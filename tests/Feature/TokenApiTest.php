<?php

declare(strict_types=1);

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Phattarachai\Kradan\Models\Activity;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

use function Pest\Laravel\postJson;
use function Pest\Laravel\withToken;

/**
 * @param  array<string, string>  $files
 * @param  array<string, string>  $fields
 */
function push(array $files, array $fields = [], string $token = 'test-token'): TestResponse
{
    return withToken($token)->post('/kradan/api/v1/push', [
        'slug' => 't188-manual-so',
        'kind' => 'decision',
        'task_ref' => 'T188',
        ...$fields,
        'bundle' => new UploadedFile(zipOf($files), 'bundle.zip', 'application/zip', test: true),
    ], ['Accept' => 'application/json']);
}

it('refuses a missing or unknown bearer token', function (): void {
    postJson('/kradan/api/v1/push')->assertUnauthorized();
    withToken('wrong')->postJson('/kradan/api/v1/push')->assertUnauthorized();
    withToken('wrong')->getJson('/kradan/api/v1/boards')->assertUnauthorized();
});

it('accepts any token whose sha256 is listed, and is throttled', function (): void {
    config()->set('kradan.tokens', [hash('sha256', 'old'), strtoupper(hash('sha256', 'new'))]);

    withToken('old')->getJson('/kradan/api/v1/boards')->assertOk();
    withToken('new')->getJson('/kradan/api/v1/boards')->assertOk();

    expect(app('router')->getRoutes()->getByName('kradan.v1.push')->gatherMiddleware())->toContain('throttle:60,1');
});

it('opens round 1 on the first push, with the steps and files of the bundle', function (): void {
    push(designFiles())
        ->assertCreated()
        ->assertJson(['board_url' => 'http://localhost/kradan/decisions/t188-manual-so', 'round' => 1, 'created' => true, 'steps' => 2]);

    $board = Board::query()->sole();
    $round = Round::query()->sole();

    expect($board->title)->toBe('Manual SO ก่อนยืนยัน')
        ->and($board->task_ref)->toBe('T188')
        ->and($round->title)->toBe('Manual SO ก่อนยืนยัน รอบ 1')
        ->and(array_column($round->steps, 'key'))->toBe(['|Block หรือเก็บไว้', 'หน้าจอ|หน้ายืนยัน'])
        ->and(Storage::disk('local')->allFiles('kradan/t188-manual-so/1'))->toEqualCanonicalizing([
            'kradan/t188-manual-so/1/index.html',
            'kradan/t188-manual-so/1/screen.html',
            'kradan/t188-manual-so/1/style.css',
        ])
        ->and(Activity::query()->where('action', 'push')->count())->toBe(1);
});

it('replaces the latest round when the data-dp title is the same, and opens a new round when it changes', function (): void {
    push(designFiles(files: ['old.css' => 'x']))->assertCreated();
    $first = Round::query()->sole()->prints;

    push(designFiles(files: ['screen.html' => '<button>ส่ง</button>']))
        ->assertOk()
        ->assertJson(['round' => 1, 'created' => false]);

    expect(Round::query()->count())->toBe(1)
        ->and(Storage::disk('local')->exists('kradan/t188-manual-so/1/old.css'))->toBeFalse()
        ->and(Round::query()->sole()->prints['หน้าจอ|หน้ายืนยัน'])->not->toBe($first['หน้าจอ|หน้ายืนยัน']);

    push(designFiles('Manual SO ก่อนยืนยัน รอบ 2'))
        ->assertCreated()
        ->assertJson(['round' => 2, 'created' => true]);

    expect(Round::query()->pluck('number')->all())->toBe([1, 2])
        ->and(Storage::disk('local')->get('kradan/t188-manual-so/1/screen.html'))->toBe('<button>ส่ง</button>')
        ->and(Storage::disk('local')->exists('kradan/t188-manual-so/2/index.html'))->toBeTrue();
});

it('reopens a decided board when a new round arrives', function (): void {
    push(designFiles())->assertCreated();
    withToken('test-token')->postJson('/kradan/api/v1/boards/t188-manual-so/decide')->assertOk()->assertJsonPath('board.status', 'decided');

    push(designFiles('Manual SO ก่อนยืนยัน รอบ 2'))->assertCreated();

    expect(Board::query()->sole()->status->value)->toBe('open');
});

it('drops what the local workbench keeps for itself', function (): void {
    push(designFiles(files: [
        'rounds/01/index.html' => 'old',
        'rounds/rounds.json' => '[]',
        'review.md' => 'local review',
        'review.json' => '{}',
        'workbench.json' => '{}',
        'img/review-shot.png' => 'png',
    ]))->assertCreated();

    expect(Storage::disk('local')->allFiles('kradan/t188-manual-so/1'))->toEqualCanonicalizing([
        'kradan/t188-manual-so/1/index.html',
        'kradan/t188-manual-so/1/screen.html',
        'kradan/t188-manual-so/1/style.css',
        'kradan/t188-manual-so/1/img/review-shot.png',
    ]);
});

it('refuses a bundle with an entry outside the folder, or without index.html', function (): void {
    foreach (['../evil.html', '/etc/evil', 'a/../../evil'] as $name) {
        push([...designFiles(), $name => 'x'])->assertUnprocessable()->assertJsonValidationErrors('bundle');
    }

    push(['screen.html' => 'x'])->assertUnprocessable()->assertJsonValidationErrors('bundle');

    expect(Board::query()->count())->toBe(0)
        ->and(Storage::disk('local')->allFiles())->toBe([]);
});

it('validates the slug and kind', function (): void {
    push(designFiles(), ['slug' => '../x'])->assertJsonValidationErrors('slug');
    push(designFiles(), ['kind' => 'poll'])->assertJsonValidationErrors('kind');
});

it('lists boards and returns every round\'s review', function (): void {
    push(designFiles())->assertCreated();
    push(designFiles('Manual SO ก่อนยืนยัน รอบ 2'))->assertCreated();

    withToken('test-token')->getJson('/kradan/api/v1/boards')
        ->assertOk()
        ->assertJsonPath('boards.0.slug', 't188-manual-so')
        ->assertJsonPath('boards.0.round', 2);

    $review = withToken('test-token')->getJson('/kradan/api/v1/boards/t188-manual-so/review')->assertOk();

    expect(array_column($review->json('rounds'), 'number'))->toBe([1, 2])
        ->and($review->json('rounds.1.markdown'))->toStartWith('T188 Manual SO ก่อนยืนยัน · รอบ 2 · http://localhost/kradan/decisions/t188-manual-so')
        ->and($review->json('rounds.1.json.title'))->toBe('Manual SO ก่อนยืนยัน รอบ 2');
});

it('never answers the token API with a session cookie', function (): void {
    $response = withToken('test-token')->getJson('/kradan/api/v1/boards');

    expect($response->headers->getCookies())->toBe([]);
});
