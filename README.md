# Sirius Wiki
<div align="center">

[Open the site](https://arduradiokot.github.io/sirius-it-wiki/) | [Русская версия](READMERU.md)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![KaTeX](https://img.shields.io/badge/KaTeX-0.16.22-329894?style=flat-square&logo=latex&logoColor=white)

</div>

<p align="center">
  <img src="docs/mockups/home.png" width="180" alt="Home">
  <img src="docs/mockups/schedule.png" width="180" alt="Schedule">
  <img src="docs/mockups/article.png" width="180" alt="Article">
  <img src="docs/mockups/review.png" width="180" alt="Quiz">
</p>


## Features

| | |
|---|---|
| **Study** | Lecture notes by day and by subject, LaTeX formulas, SVG diagrams, downloadable PDFs |
| **Self-check** | 130+ quiz questions with an explanation for every answer, grouped by topic |
| **Schedule** | Four `ИОП-ИТ` groups, countdown to the next class, rooms, teachers, current lesson highlight |
| **Reminders** | Notifications 5–30 min before class and calendar feeds for Google, Apple, Notion, ICS |
| **Campus life** | Dormitory, transport, services, events, time management |
|  **PWA** | Installs as an app and works offline; system / light / dark theme |

## Quick start

```bash
git clone https://github.com/ArduRadioKot/sirius-it-wiki.git
cd sirius-it-wiki
python3 scripts/serve.py 8765
```

Open http://localhost:8765. The local server sends no-cache headers, skips the service worker and proxies the university timetable through `/__schedule`, so edits show up right away.

## Project structure

```text
sirius-it-wiki/
├─ index.html, app.js, styles.css   # the site itself (no build step)
├─ schedule.js, schedule-source.js  # timetable page and the Livewire parser
├─ pwa.js, sw.js, manifest.webmanifest
├─ life/                  # campus life articles
├─ articles/
│  ├─ YYYY-MM-DD/         # study notes by lecture date
│  ├─ undated/            # notes without a confirmed date
│  └─ files/              # PDFs and other downloads
├─ assets/                # icons, fonts, card art, diagrams/
├─ data/schedule.json     # published timetable snapshot
├─ data/calendars/        # ICS feeds, one per group
├─ content-index.json     # generated article index
├─ scripts/               # local server, schedule fetcher, publish helpers
├─ cloud/yandex-function/ # timetable collector running from a Russian IP
├─ tests/                 # Node and Python tests
├─ docs/mockups/          # README screenshots
└─ vendor/katex/          # offline math rendering
```

## Writing articles

Create a `.md` file in `life/` or in a date folder inside `articles/` (use `articles/undated/` when the date is not confirmed) and push to `main`. The [`content-index.yml`](.github/workflows/content-index.yml) workflow rebuilds `content-index.json`, so `node generate-index.mjs` is only needed for local previews.

### Front matter

```md
---
title: Central symmetry
description: Short description shown in lists
subject: Linear algebra
order: 1
---
```

`subject` drives the **By subject** view (missing → **Другое**); the folder date drives **By day**; `order` sorts articles within a day.

### Formulas

KaTeX renders `$...$` inline and `$$...$$` as a centered block:

```md
The area of a circle is $A = \pi r^2$.

$$
e^{i\pi} + 1 = 0
$$
```

### Diagrams

Put SVGs in `assets/diagrams/` and reference them from the project root:

```md
![Triangle and its two images](assets/diagrams/motion-orientation.svg)
```

### Downloads

```md
:::download
title: Download handwritten notes
file: articles/files/linal1.pdf
description: Lecture notes for linear algebra.
:::
```

`file` is relative to the project root; `title` and `description` are optional.

### Quizzes

Single-answer questions. `answer` is the one-based number of the correct option. Every quiz also appears on the **Self-check** page.

```md
:::quiz
question: What is $(g\circ f)(x)$?
option: $f(g(x))$
option: $g(f(x))$
answer: 2
explanation: Apply $f$ first, then $g$.
:::
```

## Schedule

The **Schedule** page covers `ИОП-ИТ-26/1`, `ИОП-ИТ-26/2`, `ИОП-ИТ-25/1` and `ИОП-ИТ-25/2`: group and day pickers, a week strip with class counts, countdown to the next class, rooms and teachers. All times are Moscow time.

### How the timetable is updated

```text
GitHub Actions (every 30 min) ──► Yandex Cloud Function ──► schedule.siriusuniversity.ru
          │                              (Russian IP)
          └─► data/schedule.json + data/calendars/*.ics ──► GitHub Pages
```

- [`schedule.yml`](.github/workflows/schedule.yml) runs `scripts/publish-schedule.sh` at :17 and :47 every hour and on manual *Run workflow*. It commits only when lessons change or the snapshot is older than about 2 hours.
- The university site answers Russian IPs only, so the workflow asks `cloud/yandex-function` (free tier) to collect the current week plus the next two. Deploy it once with `bash cloud/yandex-function/deploy.sh` (needs `yc` and `gh`); it stores `SCHEDULE_COLLECTOR_URL` and `SCHEDULE_COLLECTOR_TOKEN` as repository secrets.
- On any error or unexpected format the previous snapshot is kept and nothing is committed. Same-time subgroup classes are stored separately.
- `SCHEDULE_PROXY_URL` (an HTTP(S) proxy, `http://USER:PASSWORD@HOST:PORT`) is an optional fallback for the direct fetch.
- GitHub may delay scheduled runs and pauses them after 60 days without repository activity.

In the browser the app loads the published snapshot on open, on return to the tab and when the network comes back. On GitHub Pages it does not call the university site directly (CORS always blocks it). Locally, `scripts/serve.py` can collect live through `/__schedule`.

### Reminders and calendars

- **Reminders**: 5, 10, 15 or 30 minutes before class for the selected group; permission is asked only when you press the button, and a test notification confirms it works. Timers run only while the app is open or recently backgrounded (no push server); snapshots older than a day do not notify. On iPhone notifications work only in the Home Screen app.
- **Google / Notion**: on a computer, opens Google Calendar with the group feed; on a phone, copies the feed URL with instructions for calendar.google.com. Notion Calendar shows the same Google calendar.
- **Apple**: opens the native `webcal://` subscribe dialog on iPhone, iPad and Mac.
- **Ссылка** copies the feed URL; **ICS** downloads a one-off file (subscriptions refresh, files do not).

For reminders while the app is closed, subscribe to the calendar.

## Offline and install

**Install app** shows the browser's PWA prompt or a short hint (HTTPS required; localhost is fine). After the first load reports "ready offline", the shell, all article text with formulas and the latest timetable work without a network (about 2 MB). PDFs, remote images and external links are not cached. **Update** refreshes the timetable, clears the old cache and reloads; on iPhone you may need to close and reopen the app once.

The theme button cycles **system → light → dark**; the choice is stored locally.

## Development

```bash
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
node scripts/version-worker.mjs   # bump the offline cache key after shell/asset changes
```

KaTeX 0.16.22 is vendored in `vendor/katex` (MIT) so formulas render without a CDN.
