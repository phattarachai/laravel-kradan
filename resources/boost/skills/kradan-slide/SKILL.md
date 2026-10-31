---
name: kradan-slide
description: "Make a slide deck for customers or the team as a Kradan deck: outline, HTML slides with diagrams, local preview, push to the board for review, present full screen, share a public link, revise from comments. Triggers on \"make slides\", \"ทำสไลด์\", \"deck\", \"presentation\", \"นำเสนอลูกค้า\", or /kradan-slide."
version: 2026.10.31.3
---

# Kradan Slide: decks reviewed and presented on the board

A deck is a design page whose `<body>` has `data-k-deck`: one `<section data-dp-step>` per slide on a 1920×1080
canvas. The Kradan package injects a small deck runtime (scaling, builds, transitions, diagram links), so the deck
is plain HTML and CSS: no reveal.js, no build step. The board shows one slide per step with the usual review tools
(pins, ✎ text edits, notes, drawings), presents it full screen, and makes a public present-only link.

Pushing, pulling and the remote setup are the `kradan` skill's; this skill adds what is particular to decks.

## Flow

Follow it in order. Stop where it says to wait.

1. **Sources.** Read what the deck is about: the docs, code or notes the user named. Note facts with where they
   came from. Never invent numbers, dates or names.
2. **Outline.** Write `public/design/<slug>/outline.md`: audience, goal, then one line per slide (title + the
   one point it makes + which layout from the kit). 8–15 slides for a 20-minute talk. **Show it and wait for the
   owner's approval.** Changing an outline is cheap; changing slides is not.
3. **Brand.** Read the project's colours and fonts (Tailwind config, CSS variables, the app's layout) and map
   them onto the `--k-slide-*` tokens. Thai text needs a Thai font: IBM Plex Sans Thai, Noto Sans Thai, Anuphan
   or Sarabun from Google Fonts.
4. **Write the deck** at `public/design/<slug>/index.html` with the markup below and the layout kit. Images go
   inside the folder (`img/…`) and are linked relatively.
5. **Preview locally:**
   ```bash
   php artisan kradan:deck public/design/<slug>
   ```
   It copies the runtime into `public/design/<slug>/kradan-deck/` and links it from a
   `<!-- kradan:deck:start -->` block in `<head>`. Open the page through the app (`/design/<slug>/index.html`) or
   as a file: one slide at a time, ← → Space, Home, End, F fullscreen, B black, `#N` jumps to slide N. Look at
   every slide at every build, in a screenshot if you can. Fix overflow before going on.
6. **Push:**
   ```bash
   php artisan kradan:push public/design/<slug> --dry-run
   php artisan kradan:push public/design/<slug>
   ```
   The dry run prints the title and the slide count: check both. `kradan-deck/`, `rounds/` and `review*` stay
   local, and the server injects its own runtime.
7. **Hand over** the printed board URL for review. When the owner wants it shown to someone without an account,
   make a public link (see [Sharing](#sharing)) and give that instead. When they want a file, point them to the
   board's PDF button (see [PDF](#pdf)); don't render one yourself.
8. **Revise.** When the user says there are comments, `php artisan kradan:pull <slug>` and read `review.md` (the
   `kradan` skill explains its lines). `✎ “from” → “to”` is an exact string to replace. Apply, preview, push again.
   - Same `data-dp` title → the round is replaced, viewers see มีอัปเดต on the changed slides.
   - A new title (`… รอบ 2`) → a new round when the deck's content changes meaningfully; old rounds stay readable.
   - Keep each slide's `data-title` stable across rounds: comments and มีอัปเดต are keyed by it.

## Markup

```html
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>v2 architecture</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { --k-slide-accent: #0f766e; --k-slide-accent-bg: #ccfbf1; }
  /* the deck's own layout classes */
</style>
</head>
<body data-dp="v2 architecture รอบ 1" data-k-deck>
  <section data-dp-step data-title="ปก" class="k-cover">…</section>
  <section data-dp-step data-title="ภาพรวม" data-k-transition="slide">…</section>
</body>
</html>
```

| Markup | Does |
|---|---|
| `<body data-dp="…" data-k-deck>` | The round title, and makes the board a deck |
| `<section data-dp-step data-title="…">` | One slide, 1920×1080. The title names it in the filmstrip, comments and review.md |
| `data-k-transition="fade\|slide\|zoom\|morph"` | How this slide comes in (default fade) |
| `data-k-build` or `data-k-build="n"` | Hidden until its step in present mode; unnumbered ones go one after another, equal numbers together |
| `data-k-id="x"` | Morphs into the element with the same `data-k-id` on the next slide. Use for before → after |
| `<aside data-k-notes>` | Speaker notes, never shown on the slide |
| `[data-k-diagram]` | A diagram container: lay its `[data-k-node="id"]` children out with CSS grid or flex |
| `<span data-k-link="a b">label</span>` | A connector from node `a` to node `b`, drawn as SVG and redrawn on resize and builds |
| `data-k-style="dashed\|dotted"`, `data-k-dir="both\|none"`, `data-k-route="elbow"` | Options on a link |

Every section already has the slide box: padding, a flex column with a 32px gap, 34px/1.6 text, h1 80px, h2 56px.
The kit's look has zero specificity, so the deck's own CSS always wins: plain `:root { --k-slide-accent: … }`
and plain class rules are enough, no `!important` or doubled selectors.

## Layout kit

Each block is a whole `<section>`. Copy, then change the words.

**Cover**

```html
<section data-dp-step data-title="ปก" class="k-cover">
  <div class="k-kicker">ทีมพัฒนา · พฤศจิกายน 2569</div>
  <h1 data-k-id="title">ย้ายระบบไป v2</h1>
  <p class="k-muted">สถาปัตยกรรม เครื่อง และวันย้าย</p>
</section>
```

**Title + bullets** (at most 5 bullets, one line each)

```html
<section data-dp-step data-title="ทำไมต้องย้าย">
  <h2 data-k-id="title">ทำไมต้องย้าย</h2>
  <ul>
    <li data-k-build>ระบบเดิมขยายต่อไม่ได้</li>
    <li data-k-build>deploy ด้วยมือ เสี่ยงพลาด</li>
  </ul>
</section>
```

**Diagram.** Leave at least 200px between nodes that a labelled link joins, or the label covers the line.

```html
<section data-dp-step data-title="ภาพรวม 3 ระบบ">
  <h2>ภาพรวม 3 ระบบ</h2>
  <div data-k-diagram style="display:grid;grid-template-columns:repeat(3,1fr);gap:80px 240px;align-items:center">
    <div class="k-zone" data-k-node="edge"><span class="k-zone-title">หน้าร้าน</span>
      <div class="k-box" data-k-node="web" data-k-id="web"><b>Storefront</b>Next.js</div></div>
    <div class="k-box" data-k-node="api" data-k-id="api" data-k-build="1"><b>Backoffice</b>Laravel
      <br><span class="k-chip">Horizon</span><span class="k-chip">Scheduler</span></div>
    <div class="k-box" data-k-node="db" data-k-build="2"><b>PostgreSQL</b>ฐานข้อมูลหลัก</div>
    <span data-k-link="web api" data-k-build="1">API</span>
    <span data-k-link="api db" data-k-style="dashed" data-k-build="2">อ่าน/เขียน</span>
  </div>
</section>
```

`.k-box` is a machine or system (a `<b>` first line is its name), `.k-chip` a service on it, `.k-zone` a network
or group with a `.k-zone-title`. A link hides until both of its ends are built. Links and their labels may sit
inside a zone; the lines draw above zone backgrounds and below the boxes.

**Two-column compare**

```html
<section data-dp-step data-title="ก่อนและหลัง">
  <h2>ก่อนและหลัง</h2>
  <div class="k-cols">
    <div><h3>v1</h3><ul><li>สามเครื่อง</li><li>deploy ด้วยมือ</li></ul></div>
    <div><h3>v2</h3><ul><li data-k-build>เครื่องเดียว</li><li data-k-build>CI deploy</li></ul></div>
  </div>
</section>
```

**Timeline**

```html
<section data-dp-step data-title="วันย้าย">
  <h2>วันย้าย</h2>
  <ol class="k-timeline">
    <li><time>18 พ.ย.</time>ขยายเครื่อง</li>
    <li><time>25 พ.ย. 02:00</time>เริ่มย้าย</li>
    <li><time>25 พ.ย. 06:00</time>เปิด v2</li>
  </ol>
</section>
```

**Big number**

```html
<section data-dp-step data-title="เวลาที่ร้านปิด" class="k-cover">
  <div class="k-big">4 ชั่วโมง</div>
  <p class="k-muted">ช่วงที่ปิดรับคำสั่งซื้อในคืนวันย้าย</p>
</section>
```

**Screenshot**

```html
<section data-dp-step data-title="หน้าจอใหม่">
  <h2>หน้าจอใหม่</h2>
  <figure class="k-shot"><img src="img/orders.png" alt="หน้ารายการคำสั่งซื้อ"><figcaption>รายการคำสั่งซื้อใน Backoffice</figcaption></figure>
</section>
```

**Before → after (morph).** Give the moving boxes the same `data-k-id` on two consecutive slides and set
`data-k-transition="morph"` on the second; lay them out differently and they glide into place.

## Writing slides

- One point per slide; the title says it. A slide the audience must read for a minute is a document.
- Thai text: keep line-height ≥ 1.4, never `overflow: hidden` or a fixed height on a text box, and look at every
  slide in the preview: Thai marks above and below the line are what gets cut first.
- Diagrams are HTML boxes and `data-k-link`s, so ✎ can edit their words and builds can reveal them. Mermaid only
  for a quick flow nobody will edit: load it from a CDN in the deck's own `<head>`, never expect it from Kradan.
- A deck that may be shared publicly carries nothing secret: no IPs, hostnames, ssh names, keys, internal URLs
  or personal data. Say "เครื่อง production" rather than its address.
- Present the deck yourself once (▶ on the board) before handing it over: every build, every transition.

## Sharing

Two modes, like Google Drive:

- **Internal:** the board URL. Only signed-in users the app allows into Kradan can open it; they comment and edit.
- **Public:** a link anyone can open without signing in, in present mode only, with no comments or board tools.
  ```bash
  php artisan kradan:share <slug>                # 14 days, follows the latest round
  php artisan kradan:share <slug> --days=30 --round=2
  php artisan kradan:share <slug> --list
  php artisan kradan:share <slug> --revoke=<id>
  ```
  The URL is printed once (the server keeps only a hash): give it to the user and don't write it into files.
  `--days=0` never expires; ask before making one. On the board, the แชร์ button in the top bar does the same for
  anyone the host gives `share` (by default everyone who can view the board). Public links are for decks only:
  the button is greyed out on a decision board. A link works only where Kradan is enabled.

## PDF

The board's PDF button (and the one on a public link's control bar) opens the deck's print view in a new tab: one
1920×1080 page per slide, every build shown, no notes. The print dialog opens once fonts and images have loaded;
**Save as PDF** gives a vector PDF with selectable Thai text. Chrome or Edge keeps the slide-sized page.

So a deck prints well, keep every slide inside its 1920×1080 box (it already clips there) and don't rely on a
build or transition to show something: in the PDF everything is on at once.

## When something is off

| Symptom | Fix |
|---|---|
| The board shows the page as one long screen | `<body>` lacks `data-k-deck`, or slides lack `data-dp-step` |
| A link isn't drawn | Its ids don't match a `data-k-node` inside the same `[data-k-diagram]`, or an end is still unbuilt |
| A link's label hides its line | Nodes too close: widen the gap |
| Text cut off at the slide edge | Too much on the slide: split it. The slide clips at 1920×1080 by design |
| `kradan:deck`: not a deck | Add `data-k-deck` to `<body>` |
| `kradan:share` HTTP 422 | The board isn't a deck (pushed without `data-k-deck`) |
| A public link shows 404 | Expired, revoked, or Kradan is off on that server: make a new link |
| PDF pages are A4 or Letter, not slide-sized | Print from Chrome or Edge, or set the paper size by hand |
| The แชร์ button is greyed out | The board isn't a deck |
