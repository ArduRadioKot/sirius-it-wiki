# Sirius Wiki

[Russian README](READMERU.md)

A static student wiki built with HTML, CSS, and JavaScript. Runs on GitHub Pages.

## Structure

```text
sirius-wiki/
├─ life/
│  ├─ campus.md
│  └─ services.md
└─ articles/
   ├─ 2026-09-01/
   │  └─ welcome.md
   └─ 2026-09-02/
      └─ markdown-example.md
```

`life/` contains permanent articles about university life.

`articles/YYYY-MM-DD/` contains study articles grouped by day.

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

Add a handwritten-notes download block to an article with this syntax:

```md
:::download
title: Download handwritten notes
file: articles/files/linal1.pdf
description: Lecture notes for linear algebra.
:::
```

The `file` path is relative to the project root. `title` and `description` are optional.
