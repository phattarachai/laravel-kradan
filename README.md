# Laravel Kradan

[![Latest Version on Packagist](https://img.shields.io/packagist/v/phattarachai/laravel-kradan.svg?style=flat-square)](https://packagist.org/packages/phattarachai/laravel-kradan)
[![Tests](https://img.shields.io/github/actions/workflow/status/phattarachai/laravel-kradan/run-tests.yml?branch=main&label=tests&style=flat-square)](https://github.com/phattarachai/laravel-kradan/actions/workflows/run-tests.yml?query=branch%3Amain)
[![Code Style](https://img.shields.io/github/actions/workflow/status/phattarachai/laravel-kradan/fix-php-code-style-issues.yml?branch=main&label=code%20style&style=flat-square)](https://github.com/phattarachai/laravel-kradan/actions/workflows/fix-php-code-style-issues.yml?query=branch%3Amain)
[![PHP Version](https://img.shields.io/packagist/dependency-v/phattarachai/laravel-kradan/php?style=flat-square&label=php&logo=php&logoColor=white)](https://packagist.org/packages/phattarachai/laravel-kradan)
![Laravel Version](https://img.shields.io/badge/laravel-12%20%7C%2013-FF2D20?style=flat-square&logo=laravel&logoColor=white)
[![Total Downloads](https://img.shields.io/packagist/dt/phattarachai/laravel-kradan.svg?style=flat-square)](https://packagist.org/packages/phattarachai/laravel-kradan)

A review board inside your Laravel app. Claude pushes designed pages that ask for a decision, or a slide deck;
your signed-in users pick options, comment, reply and drop pins; Claude pulls the answers back as `review.md`. A deck
also presents full screen, and can go to a customer as a public, present-only link.

Kradan (กระดาน, "board") is for the moment a design or a business rule needs answers from the people who use
the app, not only from the developer. Nothing is committed or deployed to show them a page: one command puts it
on the board, and one command brings the answers back.

## Requirements

- PHP 8.4, Laravel 12 or 13
- The `zip` and `dom` extensions
- An authenticated user model. Kradan has no accounts of its own: it reviews with your app's users.

## Install

```bash
composer require phattarachai/laravel-kradan
php artisan migrate
```

Enable it on the one environment your team reviews on (a staging or QA box), and leave it off everywhere else:

```dotenv
KRADAN_ENABLED=true
```

With `KRADAN_ENABLED=false` (the default) no route is registered at all, so every Kradan URL is a 404.

The board's JavaScript and CSS ship prebuilt and are served by the package, so there is no `vendor:publish` and
no frontend build in your app. `php artisan kradan:doctor` checks the install.

If your app uses [Laravel Boost](https://github.com/laravel/boost), `composer require` runs `boost:update`, which
rewrites the host's Boost skills. In a checkout without `node_modules` it can drop skills of unrelated packages;
check `git status` afterwards and restore them.

## Access

Register who may open Kradan in a service provider. `$ability` is one of:

| Ability | Lets a person | When the callback returns `null` |
|---|---|---|
| `view` | Open boards, pick, comment, draw, present, save a deck as PDF | No |
| `manage` | Mark a decision board decided | No |
| `share` | Make, list and revoke a deck's public links (the board's แชร์ button) | As `view` |
| `edit` | Reserved for editing a deck's text in place (not built yet) | As `manage` |

A callback that answers every ability alike, like the one below, gives all four to the same people. One that
returns `null` for `share`, or uses a `match` with no `share` arm, lets everyone who can view a board share it.

```php
use Phattarachai\Kradan\Kradan;

Kradan::auth(fn ($user, string $ability): bool => $user->isAdmin());

// Optional: how a person is shown. The default is the `name` attribute and initials.
Kradan::userUsing(fn ($user): array => [
    'id' => $user->id,
    'name' => $user->name,
    'avatar' => $user->avatar_url,
]);
```

Without a callback only the `local` environment lets signed-in users in. A guest is sent to your `login` route;
if your login route has another name, set it, or guests get a 403. For a Filament admin panel:

```dotenv
KRADAN_LOGIN_ROUTE=filament.admin.auth.login
```

`kradan:doctor` reports a route name that does not exist.

## What it does

- **Decision boards.** Each board, at `/kradan/<slug>`, holds options to pick from. Once marked decided it moves
  to history: picks lock and comments stay open. `/kradan` lists every board with search over titles, task
  references and step titles. A page that only explains something belongs in your docs, not on a board, unless
  it is a deck.
- **Decks.** A page with `<body data-k-deck>` is a slide deck: one slide per step, reviewed on the board like any
  other step (pins, ✎ text edits, notes, drawings), listed under its own tab, with no decided flow. ▶ or `F`
  presents it full screen. See [Decks](#decks).
- **Open answering.** Anyone allowed in may pick, comment or pin on any step, and everyone sees who picked what.
  The board shows how far each person got.
- **Rounds.** A push with the same `data-dp` title replaces the latest round; a new title opens the next round.
  Earlier rounds stay readable and read-only.
- **Notes, files and drawings.** Users add sticky notes, text, images, files, arrows, boxes and freehand lines
  beside or over a screen, and reply to them. Anyone may move an item; only its author edits or deletes it.
  Uploads are limited by `kradan.uploads` (size and file extensions). Images show through the sandboxed
  content prefix; every other file only downloads, so nothing uploaded runs on your app's origin.
- **History and presence.** Who viewed (at most one entry per person per 30 minutes), picked, commented and pinned.
  Avatars show who is on the board now, over a Reverb presence channel when your app broadcasts with Reverb, or
  from a 30-second heartbeat otherwise. The browser connects to the host, port and scheme of the
  `reverb.apps` entry with your broadcasting key, so an app that publishes to Reverb on loopback still
  sends browsers to its public address.

## Safety model

Pages Claude made run their own JavaScript. Served from your app's origin, that script would act with the
viewer's session. Kradan prevents that:

- Round files are served under a path-signed, expiring prefix: `/kradan/f/{round}/{expires}/{signature}/…`. The
  signature covers the round and the expiry, so relative links inside a page keep working. No session or cookie
  is involved.
- Every content response carries `Content-Security-Policy: sandbox allow-scripts` and
  `X-Content-Type-Options: nosniff`, so the page runs in an opaque origin even when opened directly. A deck's
  print view (`index.html?k=print`) adds only `allow-modals`, so it can open the print dialog.
- The board talks to each sandboxed frame only over `postMessage`, through a small agent script the package
  injects. It never reads the frame's DOM.
- Paths are normalised and anything climbing out of the round folder is refused, both in uploaded zips and in
  content URLs.
- A deck's public link (`/kradan/p/{token}`) needs no login and starts no session. The token is random, shown once,
  and stored only as a sha256. The page holds the deck's signed content URL and nothing else: no user, no comments,
  no API, a `default-src 'none'` CSP and `Referrer-Policy: no-referrer`. An unknown, expired or revoked token, or
  Kradan switched off, is a 404.

For a stricter split, serve content from a separate host that points at the same app:

```dotenv
KRADAN_CONTENT_URL=https://design.example.com
```

## Pushing and pulling (for Claude)

The `kradan:*` commands run in a developer's checkout and call the server's token API.

```bash
php artisan kradan:token --write     # token into the local .env, prints only its sha256
```

Add that hash to the server (a comma list, so tokens rotate without downtime) and point the checkout at it:

```dotenv
# server
KRADAN_TOKEN_HASHES=3f2a…,9b1c…

# developer checkout
KRADAN_REMOTE_URL=https://staging.example.com
KRADAN_REMOTE_TOKEN=…written by kradan:token --write
```

| Command | What it does |
|---|---|
| `kradan:push <dir> [--slug=] [--task=] [--dry-run]` | Zips a design folder (`index.html`) and pushes it as a round; prints the board URL |
| `kradan:pull <slug\|board url> [--to=]` | Writes `rounds/NN/review.json` and `review.md` per round, the latest as `review.md`, and every uploaded image and file into `attachments/` |
| `kradan:list` | Every board, its status and latest round |
| `kradan:decide <slug>` | Marks a board decided (not a deck) |
| `kradan:share <slug> [--days=14] [--round=] [--revoke=id] [--list]` | A deck's public, present-only link. `--days=0` never expires; without `--round` it follows the latest round. The URL is printed once |
| `kradan:deck <dir>` | Copies the deck runtime into a deck folder so it previews locally before a push |
| `kradan:doctor` | Checks the install |

The package ships a [Laravel Boost](https://github.com/laravel/boost) skill, so `php artisan boost:install`
teaches Claude this workflow in your project.

A pushed folder needs an `index.html`. Pages use the markup of the design workbench: `data-dp` on `<body>` for the round title, `data-dp-step` with
`data-title` for each step, `data-dp-option` with `data-key` and `data-label` for options, `data-dp-group` for
sections and `data-dp-frames` with `data-src` for live screens.

## Decks

A deck is a page whose `<body>` has `data-k-deck`. Each `<section data-dp-step data-title="…">` is one slide on a
1920×1080 canvas that the package's deck runtime scales to fit. The runtime (`deck.js` + `deck.css`, about 6 KB
gzipped, no reveal.js and no mermaid) is injected into deck pages the way the frame agent is.

```html
<body data-dp="v2 architecture รอบ 1" data-k-deck>
  <section data-dp-step data-title="Overview" data-k-transition="slide">
    <h2 data-k-id="title">Overview</h2>
    <div data-k-diagram class="my-grid">
      <div class="k-box" data-k-node="web" data-k-id="web"><b>Storefront</b>Next.js</div>
      <div class="k-box" data-k-node="api" data-k-build><b>Backoffice</b>Laravel</div>
      <span data-k-link="web api" data-k-style="dashed">REST</span>
    </div>
    <aside data-k-notes>Speaker notes, never on the slide.</aside>
  </section>
</body>
```

| Markup | |
|---|---|
| `data-k-transition` | `fade` (default), `slide`, `zoom` or `morph`, on the slide coming in |
| `data-k-build` / `data-k-build="n"` | Revealed one step at a time in present mode; equal numbers show together |
| `data-k-id` | The element with the same id on the next slide morphs into it (View Transitions) |
| `[data-k-diagram]` | A diagram: `[data-k-node]` boxes laid out with your CSS grid or flex |
| `<span data-k-link="a b">label</span>` | An SVG connector from node `a` to `b`, redrawn on resize and on every build. `data-k-style="dashed\|dotted"`, `data-k-dir="both\|none"`, `data-k-route="elbow"` |
| `aside[data-k-notes]` | Speaker notes |

Base classes: `.k-box` (a machine), `.k-chip` (a service), `.k-zone` with a `.k-zone-title` (a group), and
`.k-cover`, `.k-cols`, `.k-big`, `.k-timeline`, `.k-shot` for layouts. Restyle with the `--k-slide-*` tokens
(`bg`, `fg`, `muted`, `accent`, `accent-bg`, `line`, `pad`, `font`) or your own CSS. Text boxes never clip, so Thai
marks above and below the line stay whole.

**Preview locally** before pushing: `php artisan kradan:deck public/design/<slug>` copies the runtime into
`public/design/<slug>/kradan-deck/` and links it from a `<!-- kradan:deck:start -->` block in the head. Open the
page directly: one slide at a time, ← → Space, Home, End, `F` fullscreen, `B` black, `#N` in the URL. `kradan:push`
leaves that folder out, and the server strips the block and injects its own runtime.

**Present** from the board with ▶ or `F`: full screen, ← → Space PageUp PageDown, Home, End, `B` for a black screen,
Esc to leave. `?present=N` on the board URL opens the show at slide N.

**PDF.** The board's PDF button (and the one on a public link's control bar) opens the deck's print view in a new tab:
every slide on its own 1920×1080 page, every build shown, no speaker notes. The browser's print dialog opens by
itself once the fonts and images have loaded; choose **Save as PDF**. The result is a vector PDF with selectable Thai
text. Chrome and Edge honour the slide-sized page; in other browsers set the paper size by hand. Nothing runs on the
server and no dependency is added.

**Share.** The board's แชร์ button (for `share`) makes, lists and revokes public links; `kradan:share` does the same
from a checkout. A link opens the deck in present mode with no login and none of the board. It follows the latest
round unless it pins one, and expires after 14 days unless told otherwise. Public links are for decks only: on a
decision board the button is greyed out.

## Configuration

```bash
php artisan vendor:publish --tag=kradan-config
```

| Key | Env | Default | |
|---|---|---|---|
| `enabled` | `KRADAN_ENABLED` | `false` | Off means every URL 404s |
| `path` | `KRADAN_PATH` | `kradan` | |
| `connection` | `KRADAN_DB_CONNECTION` | default | Holds the `kradan_*` tables |
| `disk` | `KRADAN_DISK` | `local` | Round files go under `kradan/<slug>/<round>/` |
| `content_url` | `KRADAN_CONTENT_URL` | `null` | A separate content host |
| `signed_ttl` | `KRADAN_SIGNED_TTL` | `240` | Minutes a content URL stays valid |
| `brand` | `KRADAN_BRAND`, `KRADAN_LOGO`, `KRADAN_ACCENT` | app name | |
| `theme` | `KRADAN_THEME` | `kradan` | `kradan`, `workbench` or a token map, see below |
| `redirect_guests_to` | `KRADAN_LOGIN_ROUTE` | `login` | Route name or URL a guest is sent to; null 403s |
| `presence` | `KRADAN_PRESENCE` | `auto` | `auto`, `reverb`, `polling` or `off` |
| `uploads.max_kb` | `KRADAN_UPLOAD_MAX_KB` | `20480` | Largest image or file a user may add |
| `uploads.types` | | images, pdf, office, csv, txt, zip | Allowed file extensions |
| `tokens` | `KRADAN_TOKEN_HASHES` | none | sha256 hashes, comma separated |
| `locale` | `KRADAN_LOCALE` | `th` | `th` or `en` |

### Theme

The board is green by default. To match your app, pick another theme or override its tokens in
`config/kradan.php`. Tokens are the board's CSS custom properties without the leading `--`:

```php
'theme' => [
    'name' => 'kradan',          // optional: the theme the tokens sit on
    'k-accent' => '#ba1a1a',     // the accent, Kradan's green
    'chrome' => '#1f2937',       // the top bar and toolbars
],
```

Values must be a colour (`#hex`, `rgb()`, `hsl()`, `oklch()`, a keyword) or a length (`260px`, `1.5rem`).
Anything else is dropped before it reaches the page, and `kradan:doctor` names it. `brand.accent` still colours
the workspace badge.

## Translations

Thai is the default. Publish the language files to change the wording:

```bash
php artisan vendor:publish --tag=kradan-lang
```

## Testing

```bash
composer test
```

## Licence

MIT. See [LICENSE.md](LICENSE.md).

## ผู้พัฒนา

พัฒนาและดูแลโดย [บริษัท ภัทรชัย อาร์ทิซาน จำกัด](https://phattarachai.dev) (Phattarachai Artisan)
บริษัทที่ปรึกษาและพัฒนาเว็บ ที่เรียนรู้และแบ่งปันกับชุมชน Laravel
แพ็กเกจนี้แบ่งปันให้ชุมชนนำไปใช้และต่อยอดได้อย่างอิสระ

ดูแพ็กเกจอื่นของเราได้ที่ [phattarachai.dev/open-source](https://phattarachai.dev/open-source)
และติดต่อเราได้ที่ [phattarachai.dev](https://phattarachai.dev/#contact)
