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

Workflow `.github/workflows/pages.yml` refreshes the schedule on publish and about every four hours. GitHub Actions / Pages must be enabled (Pages source: GitHub Actions). Scheduled runs can lag, and long inactivity may pause them. The app first tries to collect the timetable from the university on the user's device whenever you open it, return to the tab, come back online, or after four hours in the background, then falls back to the published snapshot.

On **GitHub Pages**, the app first tries to load the timetable from `schedule.siriusuniversity.ru` on the user's device, then falls back to the published `data/schedule.json`. The university site does not allow GitHub Pages to read Livewire responses (CORS / SameSite cookies), so a live collect from github.io usually fails and the published snapshot is kept. Local `scripts/serve.py` proxies the source through `/__schedule` and can collect live.

If GitHub Actions cannot reach the schedule source, set the `SCHEDULE_PROXY_URL` repository secret (HTTPS proxy). The last complete snapshot in the repo is still deployed. Locally, `python3 scripts/serve.py 8765` serves without cache and proxies the university timetable through `/__schedule`. Offline mode keeps the last saved copy.

### Reminders

Choose 5, 10, 15, or 30 minutes before class. Permission is requested only after you press the button. Reminders follow the selected group; same-time classes are merged. Snapshots older than a day do not notify. Timers run only while the app is open; background tabs may pause them. There is no server push.

**Google** and **Notion** open Google Calendar with the group feed in one click; confirm the add dialog. Notion Calendar cannot subscribe to ICS itself, so the same Google calendar shows up there if that Google account is connected. **ICS** downloads a file for Apple Calendar and other apps. Re-import the file after schedule changes; a subscription refreshes itself about every four hours. On iPhone, web notifications may require adding the app to the Home Screen.

### Checks

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
node scripts/version-worker.mjs
python3 scripts/serve.py 8765
```

The versioning script bumps the offline cache key when the shell or bundled assets change. KaTeX 0.16.22 lives in `vendor/katex` under the MIT license so formulas work without a CDN.
