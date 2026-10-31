<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Date;
use Phattarachai\Kradan\Enums\BoardKind;
use Phattarachai\Kradan\Kradan;
use Phattarachai\Kradan\Models\Board;
use Phattarachai\Kradan\Models\Round;
use Phattarachai\Kradan\Models\Share;
use Phattarachai\Kradan\Support\Bundle;
use Phattarachai\Kradan\Support\ContentSigner;
use Phattarachai\Kradan\Support\RoundPublisher;
use Phattarachai\Kradan\Support\ShareLinks;

use function Pest\Laravel\actingAs;
use function Pest\Laravel\get;

function deckHtml(string $title = 'Architecture รอบ 1'): string
{
    return <<<HTML
    <!doctype html>
    <html lang="th"><head><title>x</title><!-- kradan:deck:start --><script src="kradan-deck/deck.js"></script><!-- kradan:deck:end --></head>
    <body data-dp="{$title}" data-k-deck>
      <section data-dp-step data-title="ปก"><h1>สถาปัตยกรรม</h1><aside data-k-notes>สวัสดี</aside></section>
      <section data-dp-step data-title="ภาพรวม" data-k-transition="morph">
        <div data-k-diagram><div data-k-node="a">A</div><div data-k-node="b" data-k-build>B</div><span data-k-link="a b">เรียก</span></div>
      </section>
    </body></html>
    HTML;
}

function publishDeck(string $slug = 'arch-deck', string $title = 'Architecture รอบ 1'): Round
{
    return app(RoundPublisher::class)->publish($slug, new Bundle(['index.html' => deckHtml($title)]))['round'];
}

/**
 * The JSON a share page prints for present.js.
 *
 * @return array<string, mixed>
 */
function shareBoot(string $url): array
{
    preg_match('#<script type="application/json" id="kradan-share">(.*?)</script>#s', (string) get((string) parse_url($url, PHP_URL_PATH))->assertOk()->getContent(), $match);

    return json_decode($match[1] ?? 'null', true) ?? [];
}

function deckBase(Round $round): string
{
    return (string) parse_url(app(ContentSigner::class)->baseUrl(Round::query()->with('board')->findOrFail($round->id)), PHP_URL_PATH);
}

it('makes a deck board from <body data-k-deck>, one step per slide, and a decision board otherwise', function (): void {
    $deck = boardOf(publishDeck());
    $decision = boardOf(publishRound());

    expect($deck->kind)->toBe(BoardKind::Deck)
        ->and($deck->isDeck())->toBeTrue()
        ->and(array_column(Round::query()->where('board_id', $deck->id)->firstOrFail()->steps, 'title'))->toBe(['ปก', 'ภาพรวม'])
        ->and($decision->kind)->toBe(BoardKind::Decision);
});

it('parses the demo deck the dev server shows', function (): void {
    $html = (string) file_get_contents(dirname(__DIR__, 2).'/resources/board/dev/fixtures/demo-deck/index.html');
    $round = app(RoundPublisher::class)->publish('demo-deck', new Bundle(['index.html' => $html]))['round'];

    expect(boardOf($round)->kind)->toBe(BoardKind::Deck)
        ->and(count($round->steps))->toBe(5);
});

it('lists decks with their kind, apart from decision boards', function (): void {
    publishDeck();
    publishRound();

    $boards = collect(bootOf(actingAs(kradanUser())->get('/kradan')->assertOk()->getContent())['index']['boards']);

    expect($boards->pluck('kind', 'slug')->sortKeys()->all())->toBe(['arch-deck' => 'deck', 't188-manual-so' => 'decision']);
});

it('injects the deck runtime into a deck page, strips the local preview block, and leaves decision pages alone', function (): void {
    $deck = get(deckBase(publishDeck()))->assertOk()->getContent();
    $decision = get(deckBase(publishRound()))->assertOk()->getContent();

    expect($deck)->not->toContain('kradan-deck/deck.js')
        ->toMatch('#<link rel="stylesheet" href="[^"]+/__kradan/deck\.css"></head>#')
        ->toMatch('#<script src="[^"]+/__kradan/deck\.js" data-parent="http://localhost"></script><script src="[^"]+/__kradan/agent\.js"#')
        ->and($decision)->not->toContain('deck.js')->not->toContain('deck.css');
});

it('serves the deck runtime under the signed prefix, sandboxed', function (): void {
    $base = deckBase(publishDeck());

    get($base.'__kradan/deck.js')->assertOk()
        ->assertHeader('Content-Type', 'application/javascript; charset=utf-8')
        ->assertHeader('Content-Security-Policy', 'sandbox allow-scripts');
    get($base.'__kradan/deck.css')->assertOk()->assertHeader('Content-Type', 'text/css; charset=utf-8');
});

it('has no decided flow for a deck', function (): void {
    publishDeck();

    actingAs(kradanUser())->postJson('/kradan/api/boards/arch-deck/decide')->assertUnprocessable();
    $this->withToken('test-token')->postJson('/kradan/api/v1/boards/arch-deck/decide')->assertUnprocessable();

    expect(Board::query()->where('slug', 'arch-deck')->firstOrFail()->isOpen())->toBeTrue();
});

it('tells the board who may edit a deck in place (reserved for the next phase)', function (): void {
    publishDeck();
    Kradan::auth(fn ($user, string $ability): bool => $ability !== 'edit');

    $boot = bootOf(actingAs(kradanUser())->get('/kradan/arch-deck')->assertOk()->getContent());

    expect($boot['user']['can'])->toBe(['manage' => true, 'edit' => false])
        ->and($boot['board']['kind'])->toBe('deck');
});

describe('public links', function (): void {
    it('lets manage make, list and revoke links, and shows the token only when made', function (): void {
        publishDeck();
        actingAs(kradanUser());

        $made = $this->postJson('/kradan/api/boards/arch-deck/shares', ['days' => 7])->assertCreated()->json('share');
        $list = $this->getJson('/kradan/api/boards/arch-deck/shares')->assertOk()->json('shares');

        expect($made['url'])->toMatch('#^http://localhost/kradan/p/[A-Za-z0-9]{48}$#')
            ->and($made['round'])->toBeNull()
            ->and($made['expires_at'])->not->toBeNull()
            ->and($list)->toHaveCount(1)
            ->and($list[0])->not->toHaveKey('url')
            ->and(Share::query()->value('token_hash'))->toBe(hash('sha256', basename($made['url'])));

        $this->deleteJson("/kradan/api/shares/{$made['id']}")->assertOk()->assertJsonPath('share.active', false);
    });

    it('refuses people without manage, and boards that are not decks', function (): void {
        publishDeck();
        publishRound();
        actingAs(kradanUser());

        $this->postJson('/kradan/api/boards/t188-manual-so/shares')->assertUnprocessable();

        Kradan::auth(fn ($user, string $ability): bool => $ability === 'view');
        $this->postJson('/kradan/api/boards/arch-deck/shares')->assertForbidden();
        $this->getJson('/kradan/api/boards/arch-deck/shares')->assertForbidden();
    });

    it('opens the deck in present mode without a login, a session or the board', function (): void {
        $round = publishDeck();
        $url = app(ShareLinks::class)->create(boardOf($round))['url'];

        $response = get(parse_url($url, PHP_URL_PATH))->assertOk();
        $html = (string) $response->getContent();
        $boot = shareBoot($url);

        expect($response->headers->getCookies())->toBe([])
            ->and($response->headers->get('Content-Security-Policy'))->toContain("default-src 'none'")->toContain("frame-ancestors 'none'")
            ->and($response->headers->get('Referrer-Policy'))->toBe('no-referrer')
            ->and(array_keys($boot))->toBe(['title', 'page_url', 'origin', 'slides', 'start'])
            ->and($boot['page_url'])->toStartWith("http://localhost/kradan/f/{$round->id}/")->toEndWith('/index.html')
            ->and($html)->toContain('/kradan/assets/present.js')
            ->not->toContain('csrf')->not->toContain('board.js')->not->toContain('/kradan/api');

        get($boot['page_url'])->assertOk();
    });

    it('follows the latest round, or the round it pins', function (): void {
        $first = publishDeck();
        $board = boardOf($first);
        $latest = app(ShareLinks::class)->create($board)['url'];
        $pinned = app(ShareLinks::class)->create($board, 1)['url'];
        $second = publishDeck(title: 'Architecture รอบ 2');

        expect(shareBoot($latest)['page_url'])->toContain("/kradan/f/{$second->id}/")
            ->and(shareBoot($pinned)['page_url'])->toContain("/kradan/f/{$first->id}/");
    });

    it('is a 404 once expired or revoked, or for a token nobody made', function (): void {
        $board = boardOf(publishDeck());
        $links = app(ShareLinks::class);
        $expiring = $links->create($board, days: 1);
        $revoked = $links->create($board);
        $links->revoke($revoked['share']);
        $path = fn (array $made): string => (string) parse_url($made['url'], PHP_URL_PATH);

        get($path($revoked))->assertNotFound()->assertHeader('Content-Security-Policy');
        get('/kradan/p/'.str_repeat('a', 48))->assertNotFound();
        get($path($expiring))->assertOk();

        Date::setTestNow(Date::now()->addDays(2));
        get($path($expiring))->assertNotFound();
    });

    it('is a 404 when Kradan is disabled', function (): void {
        $url = app(ShareLinks::class)->create(boardOf(publishDeck()))['url'];

        $this->rebootWith(['kradan.enabled' => false]);

        get(parse_url($url, PHP_URL_PATH))->assertNotFound();
    });

    it('is made, listed and revoked over the token API', function (): void {
        publishDeck();
        $this->withToken('test-token');

        $made = $this->postJson('/kradan/api/v1/boards/arch-deck/shares', ['round' => 1, 'days' => 0])->assertCreated()->json('share');

        expect($made['round'])->toBe(1)->and($made['expires_at'])->toBeNull()->and($made['url'])->toContain('/kradan/p/');

        $this->getJson('/kradan/api/v1/boards/arch-deck/shares')->assertOk()->assertJsonCount(1, 'shares');
        $this->deleteJson("/kradan/api/v1/shares/{$made['id']}")->assertOk()->assertJsonPath('share.active', false);
        $this->withToken('wrong')->postJson('/kradan/api/v1/boards/arch-deck/shares')->assertUnauthorized();
    });
});
