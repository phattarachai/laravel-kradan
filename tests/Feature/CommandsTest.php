<?php

declare(strict_types=1);

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

beforeEach(function (): void {
    $this->dir = sys_get_temp_dir().'/kradan-cli-'.Str::random(8);
    File::ensureDirectoryExists($this->dir);
    config()->set('kradan.remote', ['url' => 'https://staging.example.com', 'token' => 'test-token']);
});

afterEach(function (): void {
    File::deleteDirectory($this->dir);
});

it('writes a new token to the local .env and prints only its hash', function (): void {
    $original = app()->environmentPath();
    app()->useEnvironmentPath($this->dir);
    File::put("{$this->dir}/.env", "APP_NAME=Demo\nKRADAN_REMOTE_TOKEN=old\n");

    $this->artisan('kradan:token --write')
        ->expectsOutputToContain('KRADAN_TOKEN_HASHES=')
        ->doesntExpectOutputToContain('KRADAN_REMOTE_TOKEN=old')
        ->assertSuccessful();

    preg_match('/^KRADAN_REMOTE_TOKEN=(\S+)$/m', File::get("{$this->dir}/.env"), $match);
    app()->useEnvironmentPath($original);

    expect($match[1])->toHaveLength(64)->not->toBe('old')
        ->and(substr_count(File::get("{$this->dir}/.env"), 'KRADAN_REMOTE_TOKEN='))->toBe(1);
});

it('pushes a design folder as a zip without the workbench files', function (): void {
    foreach ([...designFiles(), 'review.md' => 'local', 'rounds/01/index.html' => 'old'] as $path => $contents) {
        File::ensureDirectoryExists(dirname("{$this->dir}/t188/{$path}"));
        File::put("{$this->dir}/t188/{$path}", $contents);
    }

    Http::fake(['staging.example.com/kradan/api/v1/push' => Http::response(['board_url' => 'https://staging.example.com/kradan/decisions/t188', 'round' => 1, 'title' => 'x', 'steps' => 2, 'created' => true], 201)]);

    $this->artisan('kradan:push', ['dir' => "{$this->dir}/t188", '--kind' => 'decision', '--task' => 'T188'])
        ->expectsOutputToContain('New round 1: https://staging.example.com/kradan/decisions/t188')
        ->assertSuccessful();

    Http::assertSent(function (Request $request): bool {
        $parts = collect($request->data())->pluck('contents', 'name');
        $zip = tempnam(sys_get_temp_dir(), 'kradan-sent-');
        File::put($zip, (string) $parts['bundle']);
        $archive = new ZipArchive;
        $archive->open($zip);
        $names = array_map(fn (int $i): string => (string) $archive->getNameIndex($i), range(0, $archive->numFiles - 1));

        return $request->hasHeader('Authorization', 'Bearer test-token')
            && $parts['slug'] === 't188' && $parts['kind'] === 'decision' && $parts['task_ref'] === 'T188'
            && collect($names)->sort()->values()->all() === ['index.html', 'screen.html', 'style.css'];
    });
});

it('shows what a dry run would push without sending anything', function (): void {
    foreach (designFiles() as $path => $contents) {
        File::put("{$this->dir}/{$path}", $contents);
    }

    $this->artisan('kradan:push', ['dir' => $this->dir, '--dry-run' => true])
        ->expectsOutputToContain('Manual SO ก่อนยืนยัน รอบ 1')
        ->assertSuccessful();

    Http::assertNothingSent();
});

it('pushes a markdown folder, sending --title for a page without a heading', function (): void {
    File::put("{$this->dir}/index.md", "สรุปผลการตรวจ\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");

    $this->artisan('kradan:push', ['dir' => $this->dir, '--title' => 'ผลการตรวจ รอบ 1', '--dry-run' => true])
        ->expectsOutputToContain('ผลการตรวจ รอบ 1')
        ->assertSuccessful();

    Http::fake(['staging.example.com/kradan/api/v1/push' => Http::response(['board_url' => 'https://staging.example.com/kradan/flows/x', 'round' => 1, 'title' => 'x', 'steps' => 1, 'created' => true], 201)]);

    $this->artisan('kradan:push', ['dir' => $this->dir, '--slug' => 'x', '--title' => 'ผลการตรวจ รอบ 1'])->assertSuccessful();

    Http::assertSent(fn (Request $request): bool => collect($request->data())->pluck('contents', 'name')['title'] === 'ผลการตรวจ รอบ 1');
});

it('pulls every round into rounds/NN by data-dp title, and the latest as review.md', function (): void {
    File::ensureDirectoryExists("{$this->dir}/rounds/03");
    File::put("{$this->dir}/rounds/rounds.json", json_encode([['dir' => '03', 'title' => 'Manual SO รอบ 2', 'created' => '2026-10-20T10:00:00']]));

    Http::fake(['staging.example.com/kradan/api/v1/boards/t188-manual-so/review' => Http::response([
        'board' => ['slug' => 't188-manual-so'],
        'rounds' => [
            ['number' => 1, 'title' => 'Manual SO รอบ 2', 'json' => ['round' => 1], 'markdown' => "round one\n"],
            ['number' => 2, 'title' => 'Manual SO รอบ 3', 'json' => ['round' => 2], 'markdown' => "round two\n"],
        ],
    ])]);

    $this->artisan('kradan:pull', ['board' => 'https://staging.example.com/kradan/decisions/t188-manual-so?round=2', '--to' => $this->dir])
        ->assertSuccessful();

    $rounds = json_decode(File::get("{$this->dir}/rounds/rounds.json"), true);

    expect(File::get("{$this->dir}/rounds/03/review.md"))->toBe("round one\n")
        ->and(json_decode(File::get("{$this->dir}/rounds/03/review.json"), true))->toBe(['round' => 1])
        ->and(File::get("{$this->dir}/rounds/04/review.md"))->toBe("round two\n")
        ->and(File::get("{$this->dir}/review.md"))->toBe("round two\n")
        ->and($rounds[1])->toMatchArray(['dir' => '04', 'title' => 'Manual SO รอบ 3', 'textOnly' => true]);
});

it('downloads every image and file into attachments/, at the paths the review names', function (): void {
    Http::fake([
        'staging.example.com/kradan/api/v1/boards/t188/review' => Http::response([
            'board' => ['slug' => 't188'],
            'rounds' => [
                ['number' => 1, 'title' => 'T188 รอบ 1', 'markdown' => "one\n", 'json' => ['attachments' => [
                    ['item' => 2, 'name' => 'shot.png', 'path' => 'attachments/2-shot.png', 'url' => 'https://staging.example.com/kradan/files/2/1/sig/shot.png'],
                    ['item' => 9, 'name' => 'x', 'path' => 'attachments/../../escape.txt', 'url' => 'https://staging.example.com/kradan/files/9/1/sig/x'],
                ]]],
                ['number' => 2, 'title' => 'T188 รอบ 2', 'markdown' => "two\n", 'json' => ['attachments' => [
                    ['item' => 2, 'name' => 'shot.png', 'path' => 'attachments/2-shot.png', 'url' => 'https://staging.example.com/kradan/files/2/1/sig/shot.png'],
                    ['item' => 3, 'name' => 'ราคา.xlsx', 'path' => 'attachments/3-ราคา.xlsx', 'url' => 'https://staging.example.com/kradan/files/3/1/sig/x.xlsx'],
                ]]],
            ],
        ]),
        'staging.example.com/kradan/files/2/*' => Http::response('PNGDATA'),
        'staging.example.com/kradan/files/3/*' => Http::response('XLSXDATA'),
        'staging.example.com/kradan/files/9/*' => Http::response('NOPE'),
    ]);

    $this->artisan('kradan:pull', ['board' => 't188', '--to' => "{$this->dir}/t188"])
        ->expectsOutputToContain('2 attachment(s)')
        ->assertSuccessful();

    expect(File::get("{$this->dir}/t188/attachments/2-shot.png"))->toBe('PNGDATA')
        ->and(File::get("{$this->dir}/t188/attachments/3-ราคา.xlsx"))->toBe('XLSXDATA')
        ->and(File::exists("{$this->dir}/escape.txt"))->toBeFalse();

    Http::assertSentCount(3);
});

it('lists boards and marks one decided', function (): void {
    Http::fake([
        'staging.example.com/kradan/api/v1/boards' => Http::response(['boards' => [['slug' => 't188', 'kind' => 'decision', 'status' => 'open', 'round' => 2, 'task_ref' => 'T188', 'title' => 'Manual SO', 'url' => 'https://staging.example.com/kradan/decisions/t188']]]),
        'staging.example.com/kradan/api/v1/boards/t188/decide' => Http::response(['board' => ['slug' => 't188', 'status' => 'decided', 'url' => 'https://staging.example.com/kradan/decisions/t188']]),
    ]);

    $this->artisan('kradan:list')->expectsOutputToContain('T188 Manual SO')->assertSuccessful();
    $this->artisan('kradan:decide', ['slug' => 't188'])->expectsOutputToContain('t188 is now decided')->assertSuccessful();
});

it('says what to set when the remote is not configured', function (): void {
    config()->set('kradan.remote.token', null);

    expect(fn () => $this->artisan('kradan:list')->run())->toThrow(RuntimeException::class, 'kradan:token --write');
});

it('runs the doctor and names what is missing', function (): void {
    $this->artisan('kradan:doctor')->expectsOutputToContain('Tables migrated');

    config()->set('kradan.enabled', false);

    $this->artisan('kradan:doctor')
        ->expectsOutputToContain('KRADAN_ENABLED is false')
        ->assertFailed();
});
