<?php

declare(strict_types=1);

use Phattarachai\Kradan\Models\Comment;
use Phattarachai\Kradan\Models\Pick;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ReviewBuilder;
use Phattarachai\Kradan\Tests\Fixtures\User;

use function Pest\Laravel\actingAs;

/**
 * The round from the contract's review.md example: four people answer step 1,
 * Nida comments and Somchai replies, Somchai pins, Wipa edits a word.
 */
function answeredRound(): Round
{
    publishRound();
    $round = publishRound(title: 'Manual SO ก่อนยืนยัน รอบ 2');
    [$somchai, $wipa, $nida, $ton] = array_map(kradanUser(...), ['สมชาย', 'วิภา', 'นิดา', 'ต้น']);
    $step = '|Block หรือเก็บไว้';

    $pick = fn (User $user, array $options, bool $seen = false) => Pick::query()->create(['round_id' => $round->id, 'step_key' => $step, 'user_id' => (string) $user->id, 'options' => $options, 'seen' => $seen]);
    $comment = fn (User $user, string $body, array $extra = []) => Comment::query()->create(['round_id' => $round->id, 'step_key' => $step, 'user_id' => (string) $user->id, 'body' => $body, ...$extra]);

    $pick($somchai, ['A']);
    $pick($wipa, ['A']);
    $pick($nida, ['B']);
    $pick($ton, [], seen: true);
    $parent = $comment($nida, 'ถ้า block ต้องมีทางให้ sales แก้เอง');
    $comment($somchai, 'เห็นด้วย', ['parent_id' => $parent->id]);
    $comment($somchai, 'ปุ่มนี้ควรเป็นสีแดง', ['pin' => ['option' => 'A', 'device' => 'desktop', 'x' => 0.5, 'y' => 0.5, 'text' => 'ยืนยัน']]);
    $comment($wipa, '', ['pin' => ['option' => 'A'], 'edit' => ['from' => 'ส่งคำสั่งซื้อ', 'to' => 'ยืนยันคำสั่งซื้อ']]);

    return $round;
}

it('copies the round for Claude in the exact review.md shape', function (): void {
    answeredRound();

    $markdown = actingAs(kradanUser())->get('/kradan/api/boards/t188-manual-so/export.md')
        ->assertOk()
        ->assertHeader('Content-Type', 'text/markdown; charset=utf-8')
        ->getContent();

    expect($markdown)->toBe(<<<'MD'
        T188 Manual SO ก่อนยืนยัน · รอบ 2 · http://localhost/kradan/t188-manual-so

        1. Block หรือเก็บไว้ → A: สมชาย, วิภา · B: นิดา · ข้าม: ต้น
           💬 นิดา: ถ้า block ต้องมีทางให้ sales แก้เอง
              ↳ สมชาย: เห็นด้วย
           📍1 สมชาย (A, desktop) “ยืนยัน”: ปุ่มนี้ควรเป็นสีแดง
           ✎ วิภา (A): “ส่งคำสั่งซื้อ” → “ยืนยันคำสั่งซื้อ”

        หน้าจอ
        2. หน้ายืนยัน

        MD);
});

it('names the task ref once when the title already starts with it', function (): void {
    $round = publishRound('t156-price', 'T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ รอบ 1', taskRef: 'T156');

    expect(ReviewBuilder::for($round)->markdown())->toStartWith('T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ · รอบ 1 · ');

    actingAs(kradanUser())->getJson('/kradan/api/boards')->assertJsonPath('boards.0.label', 'T156 ราคาหลังลูกค้าส่งคำสั่งซื้อ');
});

it('exports an earlier round on request, and says when nobody answered', function (): void {
    answeredRound();

    $markdown = actingAs(kradanUser())->get('/kradan/api/boards/t188-manual-so/export.md?round=1')->assertOk()->getContent();

    expect($markdown)->toContain('· รอบ 1 ·')
        ->toContain('1. Block หรือเก็บไว้ → ยังไม่มีคนตอบ');
});

it('marks a screen step read by who ticked it, and indents multi-line comments', function (): void {
    $round = publishRound();
    $user = kradanUser('ต้น');
    Pick::query()->create(['round_id' => $round->id, 'step_key' => 'หน้าจอ|หน้ายืนยัน', 'user_id' => (string) $user->id, 'options' => [], 'seen' => true]);
    Comment::query()->create(['round_id' => $round->id, 'step_key' => 'หน้าจอ|หน้ายืนยัน', 'user_id' => (string) $user->id, 'body' => "บรรทัดแรก\nบรรทัดสอง"]);

    expect(ReviewBuilder::for($round)->markdown())->toContain(<<<'MD'
        2. หน้ายืนยัน → อ่านแล้ว: ต้น
           💬 ต้น: บรรทัดแรก
             บรรทัดสอง
        MD);
});

it('gives review.json the workbench fields plus who picked what', function (): void {
    $json = ReviewBuilder::for(answeredRound())->json();

    expect($json)->toMatchArray(['source' => 'kradan', 'slug' => 't188-manual-so', 'title' => 'Manual SO ก่อนยืนยัน รอบ 2', 'round' => 2, 'missing' => [2]])
        ->and($json['steps'][0])->toMatchArray([
            'n' => 1,
            'options' => ['A', 'B'],
            'picks' => ['A', 'B'],
            'seen' => true,
            'answer' => 'A: สมชาย, วิภา · B: นิดา · ข้าม: ต้น',
        ])
        ->and($json['steps'][0]['comments'][0]['replies'][0]['user'])->toBe('สมชาย')
        ->and($json['steps'][0]['pins'][0]['no'])->toBe(1)
        ->and($json['steps'][0]['edits'][0]['edit'])->toBe(['from' => 'ส่งคำสั่งซื้อ', 'to' => 'ยืนยันคำสั่งซื้อ'])
        ->and(collect($json['progress'])->pluck('answered', 'user.name')->all())->toBe(['สมชาย' => 1, 'วิภา' => 1, 'นิดา' => 1, 'ต้น' => 1]);
});

it('writes a boxed area with every text inside the box', function (): void {
    $round = publishRound();
    $user = kradanUser('วิภา');
    Comment::query()->create(['round_id' => $round->id, 'step_key' => 'หน้าจอ|หน้ายืนยัน', 'user_id' => (string) $user->id, 'body' => 'ตัวเลขเล็กไป',
        'pin' => ['option' => null, 'device' => 'phone', 'src' => 'screen.html#confirm', 'x' => 10, 'y' => 20, 'text' => null, 'box' => ['w' => 200, 'h' => 80, 'texts' => ['11,651 / 10,000', 'เกิน 1,651']]]]);

    expect(ReviewBuilder::for($round)->markdown())->toContain('   ▭1 วิภา (phone) “11,651 / 10,000”, “เกิน 1,651”: ตัวเลขเล็กไป');
});
