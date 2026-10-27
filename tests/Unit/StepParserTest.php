<?php

declare(strict_types=1);

use Phattarachai\Kradan\Support\StepParser;

it('reads steps, groups, options and the round title the way the workbench does', function (): void {
    $files = designFiles();
    $parsed = new StepParser()->parse($files['index.html'], fn (string $path): ?string => $files[$path] ?? null);

    expect($parsed['title'])->toBe('Manual SO ก่อนยืนยัน รอบ 1')
        ->and($parsed['steps'])->toBe([
            [
                'key' => '|Block หรือเก็บไว้',
                'group' => '',
                'title' => 'Block หรือเก็บไว้',
                'sub' => 'ก่อนยืนยัน SO',
                'kind' => 'question',
                'options' => [['key' => 'A', 'title' => 'Block'], ['key' => 'B', 'title' => 'เก็บไว้']],
            ],
            [
                'key' => 'หน้าจอ|หน้ายืนยัน',
                'group' => 'หน้าจอ',
                'title' => 'หน้ายืนยัน',
                'sub' => '',
                'kind' => 'screen',
                'options' => [],
            ],
        ])
        ->and(array_keys($parsed['prints']))->toBe(['|Block หรือเก็บไว้', 'หน้าจอ|หน้ายืนยัน']);
});

it('changes a step print when the screen its frame loads changes, and only that step', function (): void {
    $before = designFiles();
    $after = designFiles(files: ['screen.html' => '<html><body><button>ส่ง</button></body></html>']);
    $parse = fn (array $files): array => new StepParser()->parse($files['index.html'], fn (string $path): ?string => $files[$path] ?? null)['prints'];

    expect($parse($after)['หน้าจอ|หน้ายืนยัน'])->not->toBe($parse($before)['หน้าจอ|หน้ายืนยัน'])
        ->and($parse($after)['|Block หรือเก็บไว้'])->toBe($parse($before)['|Block หรือเก็บไว้']);
});

it('ignores the harness block and keeps duplicate step titles apart', function (): void {
    $html = '<body data-dp="X"><section data-dp-step data-title="Q"></section><section data-dp-step data-title="Q"></section>'
        .'<!-- dp:harness:start --><section data-dp-step data-title="harness"></section><!-- dp:harness:end --></body>';

    $steps = new StepParser()->parse($html, fn (): ?string => null)['steps'];

    expect(array_column($steps, 'key'))->toBe(['|Q', '|Q|2']);
});

it('reads a page without steps as one screen step titled after the page', function (): void {
    $files = [
        'index.html' => '<body data-dp="Cover flow"><h1>ใบลา</h1><div data-dp-frames data-src="screen.html"></div></body>',
        'screen.html' => '<p>v1</p>',
    ];
    $parse = fn (array $files): array => new StepParser()->parse($files['index.html'], fn (string $path): ?string => $files[$path] ?? null);

    $parsed = $parse($files);

    expect($parsed['steps'])->toBe([['key' => '|Cover flow', 'group' => '', 'title' => 'Cover flow', 'sub' => '', 'kind' => 'screen', 'options' => []]])
        ->and(array_keys($parsed['prints']))->toBe(['|Cover flow'])
        ->and($parse([...$files, 'screen.html' => '<p>v2</p>'])['prints']['|Cover flow'])->not->toBe($parsed['prints']['|Cover flow']);
});
