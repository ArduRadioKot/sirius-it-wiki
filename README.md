# Sirius Wiki

[Russian README](READMERU.md)

A static student wiki built with HTML, CSS, and JavaScript. Runs on GitHub Pages.

## Structure

```text
sirius-it-wiki/
├─ life/                  # campus life articles
├─ articles/
│  ├─ YYYY-MM-DD/         # dated study notes
│  ├─ undated/            # study notes without a confirmed date
│  └─ files/              # PDFs and other downloads
├─ data/schedule.json     # cached timetable snapshot
├─ data/calendars/        # ICS feeds for Google and Notion
└─ vendor/katex/          # offline math rendering
```

`life/` contains permanent articles about university life.

`articles/YYYY-MM-DD/` contains study articles grouped by day. Use `articles/undated/` when the lecture date is not confirmed yet.

## Adding an Article

Create a `.md` file in `life/` or in the relevant day folder inside `articles/`, then push the changes to GitHub.

You can add the following front matter at the beginning of the file:

```md
---
title: Article title
description: Short description
subject: History
order: 1
---
```

`subject` is used by the **By subject** view in the Study section. If it is omitted, the article is placed in **Other** (`Другое`). The folder date is still used for the **By day** view.

## LaTeX Formulas

Articles support LaTeX formulas rendered by KaTeX. Use single dollar signs for inline formulas:

```md
The area of a circle is $A = \pi r^2$.
```

Use double dollar signs for a centered display formula:

```md
$$
e^{i\pi} + 1 = 0
$$
```

## Downloadable Files

Add a download block to an article with this syntax:

```md
:::download
title: Download handwritten notes
file: articles/files/linal1.pdf
description: Lecture notes for linear algebra.
:::
```

The `file` path is relative to the project root. `title` and `description` are optional.

## Theme, schedule, and install

The header theme button cycles **system → light → dark** (monitor / sun / moon icons). The choice is stored locally. Dark mode uses a plain black background.

The **Schedule** page is a compact timetable for `ИОП-ИТ-26/1` and `ИОП-ИТ-26/2`: group and day controls, countdown to the next class, rooms, teachers, and the current lesson highlight. All times are Moscow time. Long help text is kept out of the page; status is a short footer line.

**Install app** triggers the browser PWA prompt when available, or shows a short install hint. HTTPS is required (localhost is fine for development). After the first successful load and the “ready offline” status, the shell, article text with formulas, and the latest schedule snapshot work without a network. Rough size is about 2 MB. PDFs, remote images, and external links are not cached automatically. Browsers may clear storage under pressure. **Update** refreshes the published timetable, clears the old cache, and reloads; Safari on iPhone may still need the app closed and opened once. Local `scripts/serve.py` does not register a service worker, so file changes show up immediately.

### Automatic schedule

`python3 scripts/update-schedule.py` reads the public Livewire UI at
https://schedule.siriusuniversity.ru and keeps the current week plus the next two.
On errors or unexpected formats, the previous `data/schedule.json` is left unchanged.
Same-time subgroup classes are stored separately. Titles and rooms come from the source.

Workflow `.github/workflows/schedule.yml` checks the timetable every 30 minutes (and on manual *Run workflow*) with `scripts/publish-schedule.sh`; GitHub drops many cron runs, so frequent checks make up for them. It commits to `main` only when lessons change or the snapshot is older than about 2 hours, and GitHub Pages rebuilds from that commit. The university site answers Russian IPs only, so GitHub's runners cannot reach it directly: the workflow asks a small Yandex Cloud Function (`cloud/yandex-function`, free tier) to collect the timetable and return JSON. Deploy it once with `bash cloud/yandex-function/deploy.sh` (needs the `yc` CLI and `gh`); it stores `SCHEDULE_COLLECTOR_URL` and `SCHEDULE_COLLECTOR_TOKEN` as repository secrets. If the collector fails, the run keeps the old snapshot and commits nothing. Scheduled runs can lag, and GitHub pauses them after 60 days without repository activity. The app loads the published snapshot when you open it, return to the tab, or come back online. It no longer tries the university site from the browser on GitHub Pages: CORS always blocks that, and outside Russia the request used to hang for up to 45 seconds.

On **GitHub Pages**, the app first tries to load the timetable from `schedule.siriusuniversity.ru` on the user's device, then falls back to the published `data/schedule.json`. The university site does not allow GitHub Pages to read Livewire responses (CORS / SameSite cookies), so a live collect from github.io usually fails and the published snapshot is kept. Local `scripts/serve.py` proxies the source through `/__schedule` and can collect live.

If GitHub Actions cannot reach the schedule source, set the `SCHEDULE_PROXY_URL` repository secret (HTTPS proxy). The last complete snapshot in the repo is still deployed. Locally, `python3 scripts/serve.py 8765` serves without cache and proxies the university timetable through `/__schedule`. Offline mode keeps the last saved copy.

### Reminders

Choose 5, 10, 15, or 30 minutes before class. Permission is requested only after you press the button. Reminders follow the selected group; same-time classes are merged. Snapshots older than a day do not notify. Turning reminders on shows a test notification. Timers run only while the app is open or recently backgrounded; there is no server push, so for reminders with the app closed subscribe to the calendar. On iPhone notifications work only in the Home Screen app.

**Google** and **Notion** open Google Calendar with the group feed in one click on a computer; confirm the add dialog. Google's phone apps cannot subscribe by link, so on a phone the buttons copy the feed URL and explain how to add it at calendar.google.com (it then syncs to the phone). Notion Calendar shows the same Google calendar if that account is connected. **Apple** opens the native subscribe dialog (`webcal://`) on iPhone, iPad and Mac. **Ссылка** copies the feed URL for any calendar app. **ICS** downloads a one-off file (on iPhone it opens the published feed, since downloads do not work in Home Screen apps). Subscriptions refresh themselves; downloaded files do not.

### Checks

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
node scripts/version-worker.mjs
python3 scripts/serve.py 8765
```

The versioning script bumps the offline cache key when the shell or bundled assets change. KaTeX 0.16.22 lives in `vendor/katex` under the MIT license so formulas work without a CDN.
