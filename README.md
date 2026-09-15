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

**Install app** triggers the browser PWA prompt when available, or shows a short install hint. HTTPS is required (localhost is fine for development). After the first successful load and the “ready offline” status, the shell, article text with formulas, and the latest schedule snapshot work without a network. Rough size is about 2 MB. PDFs, remote images, and external links are not cached automatically. Browsers may clear storage under pressure. For a new app version, close every app window and open it again.

### Automatic schedule

`python3 scripts/update-schedule.py` reads the public Livewire UI at
https://schedule.siriusuniversity.ru and keeps the current week plus the next two.
On errors or unexpected formats, the previous `data/schedule.json` is left unchanged.
Same-time subgroup classes are stored separately. Titles and rooms come from the source.

Workflow `.github/workflows/pages.yml` refreshes the schedule on publish and about once an hour. GitHub Actions / Pages must be enabled (Pages source: GitHub Actions). Scheduled runs can lag, and long inactivity may pause them. The app checks the published snapshot every 15 minutes, on open, on tab focus, and when the network returns. Refresh loads the latest published snapshot; it does not scrape the university site from the browser.

### Reminders

Choose 5, 10, 15, or 30 minutes before class. Permission is requested only after you press the button. Reminders follow the selected group; same-time classes are merged. Snapshots older than a day do not notify. Timers run only while the app is open; background tabs may pause them. There is no server push.

**Add to calendar** downloads an ICS file with alarms for the saved classes. A calendar app can remind you with the PWA closed and offline, if its notifications are allowed. Re-import after schedule changes; duplicate handling depends on the calendar. On iPhone, web notifications may require adding the app to the Home Screen.

### Checks

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests
node scripts/version-worker.mjs
python3 -m http.server 8765
```

The versioning script bumps the offline cache key when the shell or bundled assets change. KaTeX 0.16.22 lives in `vendor/katex` under the MIT license so formulas work without a CDN.
