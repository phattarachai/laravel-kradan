<?php

declare(strict_types=1);

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Support\ContentSigner;
use Phattarachai\Kradan\Support\MarkdownPage;

use function Pest\Laravel\get;
use function Pest\Laravel\withToken;

const INVESTIGATION = <<<'MD'
    # ทำไมราคาขยับ

    สรุปจากการตรวจ log ของ SO

    | SO | ราคาเดิม | ราคาใหม่ |
    |----|---------:|---------:|
    | 1001 | 120 | 135 |

    ![ภาพหน้าจอ](img/before.png)

    - [x] ตรวจ log
    - [ ] ถามฝ่ายขาย

    <figure class="note"><svg width="10" height="10"></svg><figcaption>รูปประกอบ</figcaption></figure>

    ## ลำดับเหตุการณ์

    ```php
    $price = 135;
    ```
    MD;

/**
 * @param  array<string, string>  $files
 * @param  array<string, string>  $fields
 */
function pushMarkdown(array $files, array $fields = []): TestResponse
{
    return withToken('test-token')->post('/kradan/api/v1/push', [
        'slug' => 't156-price',
        ...$fields,
        'bundle' => new UploadedFile(zipOf($files), 'bundle.zip', 'application/zip', test: true),
    ], ['Accept' => 'application/json']);
}

it('renders markdown with tables, task lists, relative images and raw HTML kept', function (): void {
    $page = new MarkdownPage()->render(INVESTIGATION, 'fallback');

    expect($page['title'])->toBe('ทำไมราคาขยับ')
        ->and($page['html'])
        ->toContain('<body data-dp="ทำไมราคาขยับ" data-kradan-source="markdown">')
        ->toContain('<table>')
        ->toContain('<th align="right">ราคาเดิม</th>')
        ->toContain('<img src="img/before.png" alt="ภาพหน้าจอ" />')
        ->toContain('<input checked="" disabled="" type="checkbox">')
        ->toContain('<figure class="note"><svg width="10" height="10"></svg><figcaption>รูปประกอบ</figcaption></figure>')
        ->toContain('<code class="language-php">')
        ->toContain('.kradan-md { max-width: 820px')
        ->not->toContain('__kradan/mermaid.js')
        ->not->toContain('<pre class="mermaid">');
});

it('draws a mermaid fence as a diagram and loads mermaid only then, from the package', function (): void {
    $page = new MarkdownPage()->render("# Flow\n\n```mermaid\ngraph TD; A-->B & C;\n```\n", 'x');

    expect($page['html'])
        ->toContain('<pre class="mermaid">graph TD; A--&gt;B &amp; C;'."\n".'</pre>')
        ->toContain('<script src="__kradan/mermaid.js"></script>')
        ->toContain("securityLevel: 'strict'")
        ->and(file_exists(MarkdownPage::mermaidPath()))->toBeTrue();
});

it('titles the round from --title when the markdown has no # heading, then from the slug', function (): void {
    expect(new MarkdownPage()->render("## only a section\n", 'Cover flow')['title'])->toBe('Cover flow');

    pushMarkdown(['index.md' => "no heading at all\n"], ['title' => 'การลาแทนกัน รอบ 1'])->assertCreated();

    expect(Round::query()->sole()->title)->toBe('การลาแทนกัน รอบ 1')
        ->and(Board::query()->sole()->title)->toBe('การลาแทนกัน');
});

it('pushes a markdown folder as a flow board: one screen step, a new round when the heading changes', function (): void {
    pushMarkdown(['index.md' => INVESTIGATION, 'img/before.png' => 'png'])
        ->assertCreated()
        ->assertJson(['board_url' => 'http://localhost/kradan/flows/t156-price', 'round' => 1, 'steps' => 1, 'created' => true]);

    $round = Round::query()->sole();

    expect(Board::query()->sole()->kind->value)->toBe('flow')
        ->and($round->steps)->toBe([['key' => '|ทำไมราคาขยับ', 'group' => '', 'title' => 'ทำไมราคาขยับ', 'sub' => '', 'kind' => 'screen', 'options' => []]])
        ->and(Storage::disk('local')->allFiles('kradan/t156-price/1'))->toEqualCanonicalizing([
            'kradan/t156-price/1/index.md',
            'kradan/t156-price/1/index.html',
            'kradan/t156-price/1/img/before.png',
        ]);

    pushMarkdown(['index.md' => str_replace('135', '140', INVESTIGATION)])->assertOk()->assertJson(['round' => 1, 'created' => false]);
    pushMarkdown(['index.md' => str_replace('# ทำไมราคาขยับ', '# ทำไมราคาขยับ รอบ 2', INVESTIGATION)])->assertCreated()->assertJson(['round' => 2]);

    expect(Board::query()->sole()->title)->toBe('ทำไมราคาขยับ');
});

it('keeps a pushed board\'s kind, and an index.html beside index.md wins', function (): void {
    pushMarkdown(['index.md' => '# A'], ['kind' => 'decision'])->assertCreated();
    pushMarkdown(['index.md' => '# B'])->assertCreated();

    expect(Board::query()->sole()->kind->value)->toBe('decision');

    pushMarkdown(['index.md' => '# ignored', 'index.html' => designHtml('Designed รอบ 1')], ['slug' => 'both'])->assertCreated();

    expect(Round::query()->latest('id')->first()->title)->toBe('Designed รอบ 1');
});

it('serves the rendered page sandboxed, with mermaid from the signed prefix', function (): void {
    pushMarkdown(['index.md' => "# Flow\n\n```mermaid\ngraph TD; A-->B;\n```\n", 'img/before.png' => 'png'])->assertCreated();
    $round = Round::query()->with('board')->sole();
    $base = (string) parse_url(app(ContentSigner::class)->baseUrl($round), PHP_URL_PATH);

    get($base)->assertOk()
        ->assertHeader('Content-Security-Policy', 'sandbox allow-scripts')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertSee('<pre class="mermaid">', escape: false)
        ->assertSee('__kradan/agent.js', escape: false);

    get($base.'__kradan/mermaid.js')->assertOk()
        ->assertHeader('Content-Type', 'application/javascript; charset=utf-8')
        ->assertHeader('Content-Security-Policy', 'sandbox allow-scripts');

    get($base.'img/before.png')->assertOk()->assertHeader('Content-Type', 'image/png');
});
