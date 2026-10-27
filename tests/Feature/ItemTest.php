<?php

declare(strict_types=1);

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Phattarachai\Kradan\Models\Item;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ReviewBuilder;
use Phattarachai\Kradan\Tests\Fixtures\User;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\get;

const ITEMS_URL = '/kradan/api/boards/t188-manual-so/items';
const STEP = '|Block หรือเก็บไว้';

/**
 * @param  array<string, mixed>  $fields
 * @return array<string, mixed>
 */
function addItem(User $user, string $kind, array $fields = []): array
{
    return actingAs($user)->postJson(ITEMS_URL, [
        'step' => STEP,
        'kind' => $kind,
        'anchor' => ['option' => 'A', 'device' => 'desktop', 'src' => 'crop', 'on' => true],
        'x' => 120,
        'y' => 340,
        ...$fields,
    ])->assertCreated()->json();
}

function upload(User $user, string $kind, UploadedFile $file): TestResponse
{
    return actingAs($user)->post(ITEMS_URL, [
        'step' => STEP, 'kind' => $kind, 'x' => 10, 'y' => 20,
        'anchor' => ['option' => 'B', 'device' => 'phone', 'src' => 'crop', 'on' => false],
        'file' => $file,
    ], ['Accept' => 'application/json']);
}

beforeEach(function (): void {
    publishRound();
});

it('creates every kind of item in the contract shape', function (): void {
    $user = kradanUser('พัทธ์');

    $note = addItem($user, 'note', ['w' => 180, 'h' => 120, 'color' => 'yellow', 'text' => 'sales ต้องแก้เลข SO เองได้']);
    addItem($user, 'text', ['text' => 'ตรงนี้']);
    addItem($user, 'stroke', ['color' => 'red', 'points' => [[0, 0], [14, 3], [20, 9]]]);
    addItem($user, 'arrow', ['points' => [[0, 0], [80, 40]], 'texts' => ['ยืนยันตะกร้า']]);
    addItem($user, 'rect', ['w' => 200, 'h' => 80, 'texts' => ['11,651 / 10,000']]);
    addItem($user, 'ellipse', ['w' => 60, 'h' => 60]);
    $image = upload($user, 'image', UploadedFile::fake()->image('screenshot.png', 40, 30))->assertCreated()->json();
    $file = upload($user, 'file', UploadedFile::fake()->create('ราคา Q4.xlsx', 48, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))->assertCreated()->json();

    expect($note)->toMatchArray([
        'round' => 1, 'step' => STEP, 'kind' => 'note', 'mine' => true, 'reply_count' => 0,
        'anchor' => ['option' => 'A', 'device' => 'desktop', 'src' => 'crop', 'on' => true],
        'x' => 120.0, 'y' => 340.0, 'w' => 180.0, 'h' => 120.0, 'color' => 'yellow', 'text' => 'sales ต้องแก้เลข SO เองได้',
        'points' => null, 'texts' => null, 'file' => null,
    ])
        ->and($note['user']['name'])->toBe('พัทธ์')
        ->and($note)->toHaveKeys(['id', 'created_at', 'updated_at'])
        ->and($image['file'])->toMatchArray(['name' => 'screenshot.png', 'type' => 'image/png'])
        ->and($image['file']['thumb'])->toBe($image['file']['url'])
        ->and($file['file'])->toMatchArray(['name' => 'ราคา Q4.xlsx', 'size' => 48 * 1024, 'thumb' => null])
        ->and(Storage::disk('local')->files('kradan/t188-manual-so/attachments'))->toHaveCount(2);

    actingAs(kradanUser('วิภา'))->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonCount(8, 'items')
        ->assertJsonPath('items.0.mine', false)
        ->assertJsonPath('uploads.max_kb', 20480)
        ->assertJsonPath('uploads.types.0', 'png');
});

it('stores anchor.on as a boolean when a multipart upload sends "1" or "0"', function (): void {
    $user = kradanUser();
    $on = fn (string $sent): mixed => actingAs($user)->post(ITEMS_URL, [
        'step' => STEP, 'kind' => 'image', 'x' => 1, 'y' => 2,
        'anchor' => ['option' => 'A', 'device' => 'desktop', 'src' => 'crop', 'on' => $sent],
        'file' => UploadedFile::fake()->image('a.png'),
    ], ['Accept' => 'application/json'])->assertCreated()->json('anchor.on');

    expect($on('1'))->toBeTrue()
        ->and($on('0'))->toBeFalse();

    $id = Item::query()->latest('id')->value('id');
    actingAs($user)->patch("/kradan/api/items/{$id}", ['x' => 3, 'anchor' => ['option' => 'B', 'on' => '1']], ['Accept' => 'application/json'])
        ->assertOk()
        ->assertJsonPath('anchor.on', true);

    actingAs($user)->getJson('/kradan/api/boards/t188-manual-so')->assertJsonPath('items.0.anchor.on', true)->assertJsonPath('items.1.anchor.on', true);
});

it('validates items by kind', function (): void {
    $user = kradanUser();
    $post = fn (array $fields) => actingAs($user)->postJson(ITEMS_URL, ['step' => STEP, 'x' => 0, 'y' => 0, ...$fields]);

    $post(['kind' => 'stroke'])->assertJsonValidationErrors('points');
    $post(['kind' => 'note', 'color' => 'purple'])->assertJsonValidationErrors('color');
    $post(['kind' => 'sticker'])->assertJsonValidationErrors('kind');
    $post(['kind' => 'note', 'step' => 'nope'])->assertJsonValidationErrors('step');
    $post(['kind' => 'image'])->assertJsonValidationErrors('file');
});

it('rejects an upload over the size limit or outside the allowed types', function (): void {
    config()->set('kradan.uploads.max_kb', 100);
    $user = kradanUser();

    upload($user, 'file', UploadedFile::fake()->create('big.pdf', 101, 'application/pdf'))->assertJsonValidationErrors('file');
    upload($user, 'file', UploadedFile::fake()->create('run.exe', 1, 'application/octet-stream'))->assertJsonValidationErrors('file');
    upload($user, 'file', UploadedFile::fake()->create('page.html', 1, 'text/html'))->assertJsonValidationErrors('file');
    upload($user, 'image', UploadedFile::fake()->create('doc.pdf', 1, 'application/pdf'))->assertJsonValidationErrors('file');
    $disguised = tempnam(sys_get_temp_dir(), 'kradan-png-');
    file_put_contents($disguised, '<script>alert(1)</script>');
    upload($user, 'image', new UploadedFile($disguised, 'fake.png', 'image/png', test: true))->assertJsonValidationErrors('file');
    actingAs($user)->post(ITEMS_URL, ['step' => STEP, 'kind' => 'note', 'x' => 0, 'y' => 0, 'file' => UploadedFile::fake()->create('a.pdf', 1)], ['Accept' => 'application/json'])
        ->assertJsonValidationErrors('file');

    upload($user, 'file', UploadedFile::fake()->create('ok.pdf', 100, 'application/pdf'))->assertCreated();

    expect(Item::query()->count())->toBe(1);
});

it('lets anyone move or resize an item but only the author change what it says', function (): void {
    $author = kradanUser('พัทธ์');
    $other = kradanUser('สมชาย');
    $id = addItem($author, 'note', ['w' => 100, 'h' => 80, 'text' => 'เดิม', 'color' => 'yellow'])['id'];

    actingAs($other)->patchJson("/kradan/api/items/{$id}", ['x' => 5, 'y' => 6, 'w' => 200, 'h' => 150, 'anchor' => ['option' => 'B', 'device' => 'desktop', 'src' => 'crop', 'on' => false]])
        ->assertOk()
        ->assertJsonPath('x', 5)
        ->assertJsonPath('w', 200)
        ->assertJsonPath('anchor.option', 'B')
        ->assertJsonPath('mine', false);

    foreach (['text' => 'แก้', 'color' => 'red', 'points' => [[0, 0], [1, 1]], 'texts' => ['x']] as $field => $value) {
        actingAs($other)->patchJson("/kradan/api/items/{$id}", ['x' => 1, $field => $value])->assertForbidden();
    }

    actingAs($author)->patchJson("/kradan/api/items/{$id}", ['text' => 'แก้แล้ว', 'color' => 'green'])
        ->assertOk()
        ->assertJsonPath('text', 'แก้แล้ว')
        ->assertJsonPath('color', 'green')
        ->assertJsonPath('x', 5);
});

it('lets only the author delete an item', function (): void {
    $author = kradanUser('พัทธ์');
    $id = addItem($author, 'note', ['text' => 'x'])['id'];

    actingAs(kradanUser('สมชาย'))->deleteJson("/kradan/api/items/{$id}")->assertForbidden();
    actingAs($author)->deleteJson("/kradan/api/items/{$id}")->assertNoContent();

    expect(Item::query()->count())->toBe(0)
        ->and(Item::withTrashed()->count())->toBe(1);
});

it('threads replies on an item as comments with item_id, across rounds', function (): void {
    $author = kradanUser('พัทธ์');
    $id = addItem($author, 'note', ['text' => 'โน้ต'])['id'];
    publishRound(title: 'Manual SO ก่อนยืนยัน รอบ 2');
    $url = '/kradan/api/boards/t188-manual-so/rounds/2/comments';

    actingAs(kradanUser('สมชาย'))->postJson($url, ['step' => STEP, 'body' => 'เห็นด้วย', 'item_id' => $id])
        ->assertCreated()
        ->assertJsonPath('item_id', $id);
    actingAs($author)->postJson($url, ['step' => 'หน้าจอ|หน้ายืนยัน', 'body' => 'ผิดข้อ', 'item_id' => $id])->assertJsonValidationErrors('item_id');
    actingAs($author)->postJson($url, ['step' => STEP, 'body' => 'x', 'item_id' => $id, 'parent_id' => 1])->assertJsonValidationErrors('parent_id');

    actingAs($author)->getJson('/kradan/api/boards/t188-manual-so')
        ->assertJsonPath('items.0.round', 1)
        ->assertJsonPath('items.0.reply_count', 1)
        ->assertJsonPath('comments.0.item_id', $id);

    actingAs($author)->getJson('/kradan/api/boards/t188-manual-so?round=1')->assertJsonPath('comments.0.item_id', $id);
});

it('serves an uploaded image inline and sandboxed, and every other file as an attachment', function (): void {
    $user = kradanUser();
    $image = upload($user, 'image', UploadedFile::fake()->image('shot.png', 10, 10))->json('file.url');
    $file = upload($user, 'file', UploadedFile::fake()->createWithContent('สรุป.csv', "<script>alert(1)</script>\n"))->json('file.url');

    get(parse_url($image, PHP_URL_PATH))->assertOk()
        ->assertHeader('Content-Type', 'image/png')
        ->assertHeader('Content-Security-Policy', 'sandbox')
        ->assertHeader('X-Content-Type-Options', 'nosniff');

    $download = get(parse_url($file, PHP_URL_PATH))->assertOk()
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('Content-Security-Policy', 'sandbox');

    expect($download->headers->get('Content-Disposition'))->toStartWith('attachment;')->toContain("filename*=utf-8''".rawurlencode('สรุป.csv'))
        ->and($download->headers->getCookies())->toBe([]);
});

it('refuses a tampered or expired file URL', function (): void {
    $user = kradanUser();
    $first = upload($user, 'image', UploadedFile::fake()->image('a.png'))->json();
    $second = upload($user, 'image', UploadedFile::fake()->image('b.png'))->json();
    [, , , $itemId, $expires, $signature] = explode('/', (string) parse_url($first['file']['url'], PHP_URL_PATH));

    $cases = [
        'signature' => "/kradan/files/{$itemId}/{$expires}/".strrev($signature).'/a.png',
        'expiry' => '/kradan/files/'.$itemId.'/'.($expires + 3600)."/{$signature}/a.png",
        'item' => "/kradan/files/{$second['id']}/{$expires}/{$signature}/b.png",
    ];

    foreach ($cases as $case => $url) {
        expect(get($url)->status())->toBe(404, "tampered {$case}");
    }

    get("/kradan/files/{$itemId}/{$expires}/{$signature}/a.png")->assertOk();

    Date::setTestNow(Date::now()->addMinutes(config('kradan.signed_ttl') + 61));

    get("/kradan/files/{$itemId}/{$expires}/{$signature}/a.png")->assertNotFound();
});

it('writes item lines and their replies into the export', function (): void {
    $patt = kradanUser('พัทธ์');
    $somchai = kradanUser('สมชาย');
    $wipa = kradanUser('วิภา');
    $nida = kradanUser('นิดา');
    $note = addItem($patt, 'note', ['text' => 'sales ต้องแก้เลข SO เองได้']);
    $image = upload($somchai, 'image', UploadedFile::fake()->image('screenshot.png'))->json();
    $file = upload($nida, 'file', UploadedFile::fake()->create('ตะกร้าที่ยืนยันข้ามขั้น 179.xlsx', 2))->json();
    addItem($somchai, 'arrow', ['points' => [[0, 0], [5, 5]], 'texts' => ['ยืนยันตะกร้า']]);
    addItem($wipa, 'rect', ['w' => 10, 'h' => 10, 'texts' => ['11,651 / 10,000']]);
    addItem($wipa, 'stroke', ['points' => [[0, 0], [1, 1]], 'texts' => ['เลข SO ระบุเอง'], 'anchor' => ['option' => 'B', 'device' => 'desktop', 'src' => 'crop', 'on' => true]]);
    actingAs($somchai)->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => STEP, 'body' => 'จริง', 'item_id' => $note['id']])->assertCreated();

    $markdown = actingAs($patt)->get('/kradan/api/boards/t188-manual-so/export.md')->getContent();

    expect($markdown)->toContain(<<<MD
        1. Block หรือเก็บไว้ → ยังไม่มีคนตอบ
           🗒 พัทธ์: sales ต้องแก้เลข SO เองได้
              ↳ สมชาย: จริง
           🖼 สมชาย: screenshot.png (attachments/{$image['id']}-screenshot.png)
           📎 นิดา: ตะกร้าที่ยืนยันข้ามขั้น 179.xlsx (attachments/{$file['id']}-ตะกร้าที่ยืนยันข้ามขั้น-179.xlsx)
           ➚ สมชาย (A, desktop) ชี้ที่ “ยืนยันตะกร้า”
           ▭ วิภา (A, desktop) ตีกรอบ “11,651 / 10,000”
           〰 วิภา (B, desktop) วาดเส้น ใกล้ “เลข SO ระบุเอง”
        MD);
});

it('carries items into later rounds of the same step, not earlier ones', function (): void {
    $user = kradanUser('พัทธ์');
    addItem($user, 'note', ['text' => 'รอบแรก']);
    $second = publishRound(title: 'Manual SO ก่อนยืนยัน รอบ 2');
    addItem($user, 'note', ['text' => 'รอบสอง']);

    $first = ReviewBuilder::for(Round::query()->where('number', 1)->with('board')->sole());
    $json = ReviewBuilder::for($second)->json();

    expect($first->markdown())->toContain('รอบแรก')->not->toContain('รอบสอง')
        ->and(array_column($json['steps'][0]['items'], 'text'))->toBe(['รอบแรก', 'รอบสอง'])
        ->and($json['steps'][0]['items'][0]['round'])->toBe(1);
});

it('moves changed_at when someone else picks, comments, adds or deletes an item', function (): void {
    $me = kradanUser('พัทธ์');
    $other = kradanUser('สมชาย');
    $beat = fn (): ?string => actingAs($me)->postJson('/kradan/api/boards/t188-manual-so/heartbeat')->assertOk()->json('changed_at');
    $tick = fn () => Date::setTestNow(Date::now()->addSeconds(5));

    expect($beat())->toBeNull();

    $steps = [
        'pick' => fn () => actingAs($other)->putJson('/kradan/api/boards/t188-manual-so/rounds/1/picks/'.rawurlencode(STEP), ['options' => ['A']]),
        'clear pick' => fn () => actingAs($other)->putJson('/kradan/api/boards/t188-manual-so/rounds/1/picks/'.rawurlencode(STEP), ['options' => []]),
        'comment' => fn () => actingAs($other)->postJson('/kradan/api/boards/t188-manual-so/rounds/1/comments', ['step' => STEP, 'body' => 'x']),
        'item' => fn () => addItem($other, 'note', ['text' => 'x']),
        'move' => fn () => actingAs($me)->patchJson('/kradan/api/items/'.Item::query()->value('id'), ['x' => 1]),
        'delete' => fn () => actingAs($other)->deleteJson('/kradan/api/items/'.Item::query()->value('id')),
    ];
    $last = null;

    foreach ($steps as $label => $change) {
        $tick();
        $change();
        $now = $beat();

        expect($now)->not->toBeNull($label)->not->toBe($last, $label);
        $last = $now;
    }

    actingAs($me)->getJson('/kradan/api/boards/t188-manual-so')->assertJsonPath('changed_at', $last);
});
