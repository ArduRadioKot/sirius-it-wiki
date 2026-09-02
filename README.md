# Sirius Wiki

Статическая студенческая вики на HTML/CSS/JS. Работает на GitHub Pages.

## Структура

```text
sirius-wiki/
├─ .github/
│  └─ workflows/
│     └─ pages.yml
├─ assets/
│  └─ sirius-logo.svg
├─ index.html
├─ styles.css
├─ app.js
├─ generate-index.mjs
├─ content-index.json
├─ .nojekyll
├─ life/
│  ├─ campus.md
│  └─ services.md
└─ articles/
   ├─ 2026-09-01/
   │  └─ welcome.md
   └─ 2026-09-02/
      └─ markdown-example.md
```

`life/` — постоянные статьи про жизнь в университете.

`articles/YYYY-MM-DD/` — учебные статьи, сгруппированные по дням.

## Как добавить статью

Создай `.md` файл в `life/` или в папке нужного дня внутри `articles/` и отправь изменения в GitHub.

В начале файла можно указать:

```md
---
title: Название статьи
description: Короткое описание
order: 1
---
```

### На GitHub Pages

Ничего вручную генерировать не нужно.

Workflow `.github/workflows/pages.yml` на каждом `push`:

1. запускает `node generate-index.mjs`;
2. собирает актуальный `content-index.json` из всех Markdown-файлов и встраивает в него содержимое статей;
3. публикует сайт через GitHub Pages.

При открытии статьи на GitHub Pages отдельный запрос к `.md`-файлу не требуется, поэтому маршруты работают и для project Pages вида `username.github.io/repository/`.

Поэтому GitHub Pages не нужно уметь показывать список файлов в каталогах.

## Первый запуск GitHub Pages

1. Загрузи **содержимое этой папки** в корень GitHub-репозитория.
2. Открой `Settings → Pages`.
3. В `Build and deployment → Source` выбери **GitHub Actions**.
4. Сделай push в ветку `main` или `master`.
5. Открой вкладку `Actions` и дождись успешного workflow `Deploy Sirius Wiki to GitHub Pages`.

Важно: `.github` должна находиться именно в корне репозитория, а не внутри дополнительной вложенной папки.

## Локальный запуск

```bash
python -m http.server 8000
```

Открой `http://localhost:8000`.

Для локального `python -m http.server` сайт по-прежнему умеет читать directory listing, поэтому новые Markdown-файлы появляются после обновления страницы даже без ручного запуска генератора.

Если сервер не показывает содержимое папок, сайт использует готовый `content-index.json`.

## Логотип и цвета

Логотип хранится локально в `assets/sirius-logo.svg`. Он выполнен в бирюзовом варианте под основной акцент сайта.

Основной акцент задаётся одной переменной в `styles.css`:

```css
--accent: #00a7a7;
```

Дополнительные оттенки также вынесены в `--accent-dark`, `--accent-deep`, `--accent-soft` и `--accent-softer`.
