<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\Bundle;
use Phattarachai\Kradan\Support\RoundPublisher;
use Phattarachai\Kradan\Tests\Fixtures\User;
use Phattarachai\Kradan\Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class)->in('Feature');
uses(TestCase::class)->in('Unit');

function kradanUser(string $name = 'สมชาย'): User
{
    return User::query()->create([
        'name' => $name,
        'email' => md5($name.microtime()).'@example.test',
        'password' => 'secret',
    ]);
}

/**
 * A design page the way the design skill writes one: a grouped question with
 * options A and B, then a screen step whose frame loads screen.html.
 */
function designHtml(string $title = 'Manual SO ก่อนยืนยัน รอบ 1', string $question = 'Block หรือเก็บไว้'): string
{
    return <<<HTML
    <!doctype html>
    <html lang="th">
    <head><title>ignored</title><link rel="stylesheet" href="style.css"></head>
    <body data-dp="{$title}">
      <section data-dp-step data-title="{$question}" data-sub="ก่อนยืนยัน SO">
        <div data-dp-option data-key="A" data-label="Block">A</div>
        <div data-dp-option data-key="B" data-label="เก็บไว้">B</div>
      </section>
      <div data-dp-group data-title="หน้าจอ">
        <section data-dp-step data-title="หน้ายืนยัน">
          <div data-dp-frames data-src="screen.html#confirm"></div>
        </section>
      </div>
    <!-- dp:harness:start --><script src="/design/harness.js"></script><!-- dp:harness:end -->
    </body>
    </html>
    HTML;
}

/**
 * @param  array<string, string>  $files  path => contents, written into a zip in that order
 */
function zipOf(array $files): string
{
    $path = tempnam(sys_get_temp_dir(), 'kradan-test-').'.zip';
    $zip = new ZipArchive;
    $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);

    foreach ($files as $name => $contents) {
        $zip->addFromString($name, $contents);
    }

    $zip->close();

    return $path;
}

/**
 * @param  array<string, string>  $files
 */
function designFiles(string $title = 'Manual SO ก่อนยืนยัน รอบ 1', array $files = []): array
{
    return [
        'index.html' => designHtml($title),
        'screen.html' => '<html><body><button>ยืนยัน</button></body></html>',
        'style.css' => 'body { color: red; }',
        ...$files,
    ];
}

/**
 * @param  array<string, string>  $files
 */
function publishRound(string $slug = 't188-manual-so', string $title = 'Manual SO ก่อนยืนยัน รอบ 1', array $files = [], ?string $taskRef = 'T188'): Round
{
    $result = app(RoundPublisher::class)->publish($slug, new Bundle(designFiles($title, $files)), $taskRef);

    return $result['round'];
}

function boardOf(Round $round): Board
{
    return Board::query()->findOrFail($round->board_id);
}
