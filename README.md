# Laravel Kradan

[![Latest Version on Packagist](https://img.shields.io/packagist/v/phattarachai/laravel-kradan.svg?style=flat-square)](https://packagist.org/packages/phattarachai/laravel-kradan)
[![Tests](https://img.shields.io/github/actions/workflow/status/phattarachai/laravel-kradan/run-tests.yml?branch=main&label=tests&style=flat-square)](https://github.com/phattarachai/laravel-kradan/actions/workflows/run-tests.yml?query=branch%3Amain)
[![Code Style](https://img.shields.io/github/actions/workflow/status/phattarachai/laravel-kradan/fix-php-code-style-issues.yml?branch=main&label=code%20style&style=flat-square)](https://github.com/phattarachai/laravel-kradan/actions/workflows/fix-php-code-style-issues.yml?query=branch%3Amain)
[![PHP Version](https://img.shields.io/packagist/dependency-v/phattarachai/laravel-kradan/php?style=flat-square&label=php&logo=php&logoColor=white)](https://packagist.org/packages/phattarachai/laravel-kradan)
![Laravel Version](https://img.shields.io/badge/laravel-12%20%7C%2013-FF2D20?style=flat-square&logo=laravel&logoColor=white)
[![Total Downloads](https://img.shields.io/packagist/dt/phattarachai/laravel-kradan.svg?style=flat-square)](https://packagist.org/packages/phattarachai/laravel-kradan)

A review board inside your Laravel app. Claude pushes design, decision and flow pages; your signed-in users
pick options, comment, reply and drop pins; Claude pulls the answers back as `review.md`.

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

## Access

Register who may open each panel in a service provider. `$ability` is `view` or `manage`; `manage` may mark a
decision board decided.

```php
use Phattarachai\Kradan\Kradan;

Kradan::auth(fn ($user, string $panel, string $ability): bool => $user->isAdmin());

// Optional: how a person is shown. The default is the `name` attribute and initials.
Kradan::userUsing(fn ($user): array => [
    'id' => $user->id,
    'name' => $user->name,
    'avatar' => $user->avatar_url,
]);
```

Without a callback only the `local` environment lets signed-in users in. A guest is sent to your `login` route.

## What it does

- **Two panels.** *Decisions* hold options to pick from; once marked decided they move to history, picks lock and
  comments stay open. *Flows* are living explanations of how the system works, updated as it changes. Each panel
  has its own path and its own auth check. `/kradan` lists every board with search over titles, task references
  and step titles.
- **Open answering.** Anyone allowed in may pick, comment or pin on any step, and everyone sees who picked what.
  The board shows how far each person got.
- **Rounds.** A push with the same `data-dp` title replaces the latest round; a new title opens the next round.
  Earlier rounds stay readable and read-only.
- **History and presence.** Who viewed (at most one entry per person per 30 minutes), picked, commented and pinned.
  Avatars show who is on the board now, over a Reverb presence channel when your app broadcasts with Reverb, or
  from a 30-second heartbeat otherwise.

## Safety model

Pages Claude made run their own JavaScript. Served from your app's origin, that script would act with the
viewer's session. Kradan prevents that:

- Round files are served under a path-signed, expiring prefix: `/kradan/f/{round}/{expires}/{signature}/…`. The
  signature covers the round and the expiry, so relative links inside a page keep working. No session or cookie
  is involved.
- Every content response carries `Content-Security-Policy: sandbox allow-scripts` and
  `X-Content-Type-Options: nosniff`, so the page runs in an opaque origin even when opened directly.
- The board talks to each sandboxed frame only over `postMessage`, through a small agent script the package
  injects. It never reads the frame's DOM.
- Paths are normalised and anything climbing out of the round folder is refused, both in uploaded zips and in
  content URLs.

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
| `kradan:push <dir> [--slug=] [--kind=decision\|flow] [--task=] [--dry-run]` | Zips a design folder and pushes it as a round; prints the board URL |
| `kradan:pull <slug\|board url> [--to=]` | Writes `rounds/NN/review.json` and `review.md` per round, and the latest as `review.md` |
| `kradan:list` | Every board, its kind, status and latest round |
| `kradan:decide <slug>` | Marks a decision board decided (a flow archived) |
| `kradan:doctor` | Checks the install |

The package ships a [Laravel Boost](https://github.com/laravel/boost) skill, so `php artisan boost:install`
teaches Claude this workflow in your project.

Pages use the markup of the design workbench: `data-dp` on `<body>` for the round title, `data-dp-step` with
`data-title` for each step, `data-dp-option` with `data-key` and `data-label` for options, `data-dp-group` for
sections and `data-dp-frames` with `data-src` for live screens.

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
| `panels` | | flows, decisions | Key, kind and title of each panel |
| `brand` | `KRADAN_BRAND`, `KRADAN_LOGO`, `KRADAN_ACCENT` | app name | |
| `presence` | `KRADAN_PRESENCE` | `auto` | `auto`, `reverb`, `polling` or `off` |
| `tokens` | `KRADAN_TOKEN_HASHES` | none | sha256 hashes, comma separated |
| `locale` | `KRADAN_LOCALE` | `th` | `th` or `en` |

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
