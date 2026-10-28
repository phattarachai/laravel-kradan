---
name: kradan
description: "Share a finished public/design/<slug> page that needs a decision with this app's signed-in users on the Kradan board, then pull their picks and comments back. Triggers on \"push to kradan\", \"ให้ user เลือก\", \"ส่งให้ทีมดู\", \"pull the answers\", a /kradan/ board link, or kradan:push / kradan:pull."
version: 2026.10.28.3
---

# Kradan: design review with the app's own users

Kradan (กระดาน) serves a design page you made to this project's signed-in users at `/kradan`. They pick
options, comment, reply and pin; you pull the answers back as `review.md`. Use it once a page is ready for
**business users**. While the owner alone is reviewing, keep using the local design workbench.

The commands run in this checkout and talk to the server in `KRADAN_REMOTE_URL` with `KRADAN_REMOTE_TOKEN`.

## Push a page

1. The page is a design-skill page in `public/design/<slug>/` (`data-dp`, `data-dp-step`, `data-dp-option`,
   `data-dp-frames`). Its `<body data-dp="…">` title names the round.
2. Push it:
   ```bash
   php artisan kradan:push public/design/<slug> --task=T188
   ```
   - The folder needs an `index.html`. A board asks for a decision; an explanation with nothing to decide
     belongs in the project's docs, not on Kradan.
   - `--dry-run` prints the round title, file count and step count without sending.
   - `rounds/`, `review*` and `workbench.json` stay local.
3. Give the user the printed board URL. Users answer whenever they get to it. Don't wait or poll.

**Rounds.** Same `data-dp` title as the latest round → that round is replaced (users see มีอัปเดต). A new
title (`… รอบ 2`) → a new round; earlier rounds stay readable and read-only. Change the title when the
question changes, not for a typo fix.

## Read the answers

When the user says the board has answers, or pastes a board link:

```bash
php artisan kradan:pull <slug or board URL>
```

It writes `rounds/NN/review.json` + `review.md` for every round (NN matched by title in `rounds/rounds.json`)
and the latest round as `public/design/<slug>/review.md`. Read `review.md`; open `review.json` only for pin
coordinates or a boxed text list. A user may instead paste the board's **คัดลอกให้ Claude** text: same shape.

```
T188 Manual SO ก่อนยืนยัน · รอบ 2 · https://…/kradan/decisions/t188-manual-so

1. Block หรือเก็บไว้ → A: สมชาย, วิภา · B: นิดา · ข้าม: ต้น
   💬 นิดา: ถ้า block ต้องมีทางให้ sales แก้เอง
      ↳ สมชาย: เห็นด้วย
   📍1 สมชาย (A, desktop) “ยืนยัน”: ปุ่มนี้ควรเป็นสีแดง
   ✎ วิภา (A): “ส่งคำสั่งซื้อ” → “ยืนยันคำสั่งซื้อ”
```

- Every option lists who picked it. It is a discussion, not a vote: weigh the comments and who wrote them.
- `ข้าม` means looked, no preference. `อ่านแล้ว` on a screen step means seen.
- `📍` is a pin on a spot (option, device, the text under it). `▭` is a boxed area. `✎` is an exact
  string to find and replace in the source.
- `ยังไม่มีคนตอบ` means nobody answered that step yet.
- Users also add things to the board: `🗒` a note, `🖼` an image and `📎` a file (pull saves both under
  `attachments/`, at the path in brackets: open images to look at them), `➚` an arrow at a text, `▭` a box
  or circle around texts, `〰` a freehand line near a text. `↳` lines are replies to the item above.

## Other commands

- `php artisan kradan:list`: every board, its status and latest round.
- `php artisan kradan:decide <slug>`: file a board as decided. Picks lock and
  comments stay open. Do it once the decision is made and recorded, and only when the user agrees.
- `php artisan kradan:doctor`: checks the install on the server side (enabled, tables, disk, assets, theme).

To make the board match the app's colours, set `kradan.theme` in `config/kradan.php`: a theme name
(`kradan`, `workbench`) or a map of the board's CSS tokens without `--`, e.g.
`['k-accent' => '#ba1a1a', 'chrome' => '#1f2937']`. Only colours and lengths pass; the doctor names a
dropped token.

## When a command fails

| Message | Fix |
|---|---|
| `KRADAN_REMOTE_TOKEN is not set` | Run `php artisan kradan:token --write`. It writes the token to `.env` and prints only a hash. Ask the user to add that hash to the server's `KRADAN_TOKEN_HASHES` (comma list) and deploy. Never print or paste the token. |
| `KRADAN_REMOTE_URL is not set` | Ask the user which environment hosts Kradan and set its app URL. |
| HTTP 401 | The server doesn't list this token's hash yet. Same as above. |
| HTTP 404 on every URL | Kradan is off on that server (`KRADAN_ENABLED=false`) or the URL is wrong. |
| HTTP 422 `bundle` | The folder has no top-level `index.html` (markdown is not accepted), or a file path climbs out of it. |
