<?php

declare(strict_types=1);

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\UnableToCreateDirectory;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;

/**
 * A disk that refuses every write, the way a `kradan/` folder owned by another user does.
 */
function brokenDisk(): Filesystem
{
    $disk = Mockery::mock(Filesystem::class);
    $disk->shouldReceive('put')->andThrow(UnableToCreateDirectory::atLocation('kradan/x', 'Permission denied'));
    $disk->shouldReceive('deleteDirectory')->andReturnTrue();
    Storage::set('broken', $disk);
    config()->set('kradan.disk', 'broken');

    return $disk;
}

it('checks the disk without leaving a folder or a file behind', function (): void {
    $this->artisan('kradan:doctor')->expectsOutputToContain('writable');

    expect(Storage::disk('local')->allDirectories())->toBe([])
        ->and(Storage::disk('local')->allFiles())->toBe([]);
});

it('leaves no board and no round when the disk refuses a new round\'s files', function (): void {
    brokenDisk();

    expect(fn () => publishRound())->toThrow(RuntimeException::class, 'could not write the round\'s files');

    expect(Board::query()->count())->toBe(0)
        ->and(Round::query()->count())->toBe(0);
});

it('keeps the replaced round as it was when the disk refuses its new files', function (): void {
    $round = publishRound(files: ['screen.html' => '<p>v1</p>']);
    $prints = $round->prints;

    brokenDisk();
    $before = Round::query()->findOrFail($round->id)->pushed_at;

    expect(fn () => publishRound(files: ['screen.html' => '<p>v2</p>']))->toThrow(RuntimeException::class);

    config()->set('kradan.disk', 'local');
    $after = Round::query()->findOrFail($round->id);

    expect($after->prints)->toBe($prints)
        ->and($after->pushed_at->equalTo($before))->toBeTrue()
        ->and(Storage::disk('local')->get('kradan/t188-manual-so/1/screen.html'))->toBe('<p>v1</p>');
});

it('drops the files a replaced round no longer has', function (): void {
    publishRound(files: ['old.css' => 'a {}']);
    publishRound();

    expect(Storage::disk('local')->exists('kradan/t188-manual-so/1/old.css'))->toBeFalse()
        ->and(Storage::disk('local')->exists('kradan/t188-manual-so/1/index.html'))->toBeTrue();
});
