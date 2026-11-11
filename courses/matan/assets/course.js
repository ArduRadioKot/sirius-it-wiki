// Общие интерактивные компоненты: тест, конструктор формул, самооценка, отчёт.
// Ответы новой попытки скрыты; общий результат хранится отдельно от ответов.
window.createMatanCourse = function () {
  const sections = [];
  let selfGrade = null;
  let reportHook = function () {};

  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function addSection(title, total) {
    const section = { title: title, total: total, done: 0, right: 0, misses: [] };
    sections.push(section);
    return section;
  }

  function record(section, ok, tag) {
    section.done += 1;
    if (ok) section.right += 1;
    else section.misses.push(tag);
    reportHook();
    window.dispatchEvent(new CustomEvent('course-result', { detail: { right: sections.reduce((n,s)=>n+s.right,0), total: sections.reduce((n,s)=>n+s.total,0), done: sections.reduce((n,s)=>n+s.done,0) } }));
  }

  function feedback(ok, why) {
    return (ok ? '<span class="ok">✓ Верно.</span> ' : '<span class="no">✗ Неверно.</span> ') + why;
  }

  // questions: [{ tag, q, options: [html], correct: индекс, why: html }]
  function quiz(selector, title, questions) {
    const root = document.querySelector(selector);
    const section = addSection(title, questions.length);
    questions.forEach(function (item, n) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'q', '<span class="qnum">Вопрос ' + (n + 1) + ' из ' + questions.length + '</span>' + item.q));
      const opts = el('div', 'opts');
      const fb = el('div', 'fb');
      fb.setAttribute('aria-live', 'polite');
      const buttons = item.options.map(function (text, i) {
        const button = el('button', 'opt', text);
        button.type = 'button';
        button.addEventListener('click', function () {
          buttons.forEach(function (b) { b.disabled = true; });
          buttons[item.correct].classList.add('right');
          const ok = i === item.correct;
          if (!ok) button.classList.add('wrong');
          fb.innerHTML = feedback(ok, item.why);
          record(section, ok, item.tag);
        });
        opts.appendChild(button);
        return button;
      });
      card.appendChild(opts);
      card.appendChild(fb);
      root.appendChild(card);
    });
  }

  // tasks: [{ tag, given, parts: [строка | { options: [строка], answer: индекс }], why }]
  function builder(selector, title, tasks) {
    const root = document.querySelector(selector);
    const section = addSection(title, tasks.length);
    tasks.forEach(function (task, n) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'given', '<span class="qnum">Задание ' + (n + 1) + ' из ' + tasks.length + '</span>' + (task.prompt || 'Постройте отрицание: ') + '<span class="f">' + task.given + '</span>'));
      const line = el('div', 'line');
      const slots = [];
      task.parts.forEach(function (part) {
        if (typeof part === 'string') {
          line.appendChild(el('span', '', part));
          return;
        }
        const slot = el('button', 'slot empty', '?');
        slot.type = 'button';
        slot.setAttribute('aria-label', 'Поле ' + (slots.length + 1) + ': не выбрано. Нажмите, чтобы сменить значение');
        const entry = { part: part, node: slot, value: -1 };
        slot.addEventListener('click', function () {
          entry.value = (entry.value + 1) % part.options.length;
          slot.textContent = part.options[entry.value];
          slot.classList.remove('empty');
          slot.setAttribute('aria-label', 'Поле ' + (slots.indexOf(entry) + 1) + ': ' + part.options[entry.value] + '. Нажмите, чтобы сменить значение');
        });
        slots.push(entry);
        line.appendChild(slot);
      });
      card.appendChild(line);
      const check = el('button', 'btn', 'Проверить');
      check.type = 'button';
      const fb = el('div', 'fb');
      fb.setAttribute('aria-live', 'polite');
      check.addEventListener('click', function () {
        if (slots.some(function (s) { return s.value < 0; })) {
          fb.textContent = 'Заполните все поля со знаком «?». Нажатие на поле меняет его значение.';
          return;
        }
        let ok = true;
        slots.forEach(function (s) {
          const good = s.value === s.part.answer;
          ok = ok && good;
          s.node.disabled = true;
          s.node.classList.add(good ? 'right' : 'wrong');
          if (!good) s.node.textContent = s.part.options[s.value] + ' → ' + s.part.options[s.part.answer];
        });
        check.disabled = true;
        fb.innerHTML = feedback(ok, task.why);
        record(section, ok, task.tag);
      });
      card.appendChild(check);
      card.appendChild(fb);
      root.appendChild(card);
    });
  }

  // Таблица истинности. tasks: [{ tag, columns: [{ label, values: [0|1], ask: true|false }], why }]
  // 0 — ложь (Л), 1 — истина (И). Столбцы с ask: true ученик заполняет сам.
  const TV = ['Л', 'И'];
  function table(selector, title, tasks) {
    const root = document.querySelector(selector);
    const section = addSection(title, tasks.length);
    tasks.forEach(function (task, n) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'q', '<span class="qnum">Таблица ' + (n + 1) + ' из ' + tasks.length + '</span>Нажимайте на клетки «?». Каждое нажатие меняет значение: Л → И → Л.'));
      const wrap = el('div', 'tablewrap');
      const tbl = el('table', 'truth');
      const head = el('tr');
      task.columns.forEach(function (col) { head.appendChild(el('th', 'c f', col.label)); });
      tbl.appendChild(el('thead')).appendChild(head);
      const body = el('tbody');
      const cells = [];
      task.columns[0].values.forEach(function (_, r) {
        const tr = el('tr');
        task.columns.forEach(function (col) {
          const td = el('td', 'c');
          if (!col.ask) {
            td.textContent = TV[col.values[r]];
          } else {
            const b = el('button', 'slot empty', '?');
            b.type = 'button';
            const cell = { node: b, value: -1, answer: col.values[r], name: 'Строка ' + (r + 1) + ', столбец ' + col.label };
            b.setAttribute('aria-label', cell.name + ': не выбрано');
            b.addEventListener('click', function () {
              cell.value = cell.value === 0 ? 1 : 0;
              b.textContent = TV[cell.value];
              b.classList.remove('empty');
              b.setAttribute('aria-label', cell.name + ': ' + TV[cell.value]);
            });
            cells.push(cell);
            td.appendChild(b);
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      tbl.appendChild(body);
      wrap.appendChild(tbl);
      card.appendChild(wrap);
      const check = el('button', 'btn', 'Проверить');
      check.type = 'button';
      const fb = el('div', 'fb');
      fb.setAttribute('aria-live', 'polite');
      check.addEventListener('click', function () {
        if (cells.some(function (c) { return c.value < 0; })) {
          fb.textContent = 'Заполните все клетки со знаком «?».';
          return;
        }
        let wrong = 0;
        cells.forEach(function (c) {
          const good = c.value === c.answer;
          if (!good) { wrong += 1; c.node.textContent = TV[c.value] + '→' + TV[c.answer]; }
          c.node.disabled = true;
          c.node.classList.add(good ? 'right' : 'wrong');
        });
        check.disabled = true;
        const head = wrong === 0 ? '' : 'Ошибок: ' + wrong + '. Правильное значение стоит после стрелки. ';
        fb.innerHTML = feedback(wrong === 0, head + task.why);
        record(section, wrong === 0, task.tag);
      });
      card.appendChild(check);
      card.appendChild(fb);
      root.appendChild(card);
    });
  }


  // Свои примеры ученика. items: [{ tag, q }]. Автопроверки нет: ответы уходят в отчёт, их проверяет преподаватель в чате.
  const examples = [];
  function myExamples(selector, items) {
    const root = document.querySelector(selector);
    items.forEach(function (item, n) {
      const card = el('div', 'card ex');
      card.appendChild(el('div', 'q', '<span class="qnum">Пример ' + (n + 1) + ' из ' + items.length + '</span>' + item.q));
      const area = document.createElement('textarea');
      area.setAttribute('aria-label', 'Ваш пример: ' + item.tag);
      area.placeholder = 'Ваш пример…';
      const entry = { tag: item.tag, area: area };
      area.addEventListener('input', function () { reportHook(); });
      examples.push(entry);
      card.appendChild(area);
      if (item.sample) card.appendChild(el('details', 'poyasn', '<summary>Образец ответа</summary><p>' + item.sample + '</p>'));
      root.appendChild(card);
    });
  }

  // Та же шкала, что на коллоквиуме: 0, ½, 1.
  function grade(selector) {
    const root = document.querySelector(selector);
    const row = el('div', 'grades');
    const buttons = ['0', '½', '1'].map(function (value) {
      const button = el('button', 'grade', value);
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () {
        selfGrade = value;
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        reportHook();
      });
      row.appendChild(button);
      return button;
    });
    root.appendChild(row);
  }

  function reportText(lesson) {
    const lines = ['Урок: ' + lesson];
    sections.forEach(function (s) {
      let line = s.title + ': ' + s.right + ' из ' + s.total;
      if (s.done < s.total) line += ' (пройдено ' + s.done + ')';
      if (s.misses.length) line += '; ошибки: ' + s.misses.join(', ');
      lines.push(line);
    });
    if (examples.length) {
      lines.push('Мои примеры:');
      examples.forEach(function (e) { lines.push('- ' + e.tag + ': ' + (e.area.value.trim() || '(пусто)')); });
    }
    if (document.querySelector('.grades')) lines.push('Письменный ответ, самооценка: ' + (selfGrade === null ? 'нет' : selfGrade));
    return lines.join('\n');
  }

  function report(selector, lesson) {
    const root = document.querySelector(selector);
    const output = el('div', 'report');
    const copy = el('button', 'btn', 'Скопировать отчёт');
    copy.type = 'button';
    const status = el('span', 'note');
    status.setAttribute('aria-live', 'polite');
    status.style.marginLeft = '.6rem';
    reportHook = function () { output.textContent = reportText(lesson); };
    copy.addEventListener('click', function () {
      const text = reportText(lesson);
      const done = function () { status.textContent = 'Скопировано'; };
      const fallback = function () {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        area.remove();
        status.textContent = ok ? 'Скопировано' : 'Не удалось: выделите текст отчёта вручную';
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
    root.appendChild(output);
    root.appendChild(copy);
    root.appendChild(status);
    reportHook();
  }


  // Карточки. deck: [{ topic: 'Тема 1', q: 'вопрос', a: 'ответ (html)' }]
  // «Не знал» возвращает карточку в конец очереди; в итоге — список карточек, не вспомненных с первого раза.
  function cards(selector, deck) {
    const root = document.querySelector(selector);
    const topics = Array.from(new Set(deck.map(function (c) { return c.topic; })));
    const chosen = new Set(topics);
    const bar = el('div', 'grades');
    topics.forEach(function (t) {
      const b = el('button', 'grade', t);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () {
        if (chosen.has(t) && chosen.size > 1) chosen.delete(t); else chosen.add(t);
        b.setAttribute('aria-pressed', String(chosen.has(t)));
        start();
      });
      bar.appendChild(b);
    });
    const box = el('div', 'card');
    box.setAttribute('aria-live', 'polite');
    root.appendChild(bar);
    root.appendChild(box);
    let queue = [], missed = [], total = 0, firstTry = 0;

    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function start() {
      queue = shuffle(deck.filter(function (c) { return chosen.has(c.topic); }).slice());
      missed = []; total = queue.length; firstTry = 0;
      show();
    }
    function button(text, onClick) {
      const b = el('button', 'btn', text);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }
    function show() {
      box.innerHTML = '';
      if (!queue.length) {
        box.appendChild(el('p', '', '<strong>Готово.</strong> С первого раза: ' + firstTry + ' из ' + total + '.'));
        if (missed.length) {
          box.appendChild(el('p', '', 'Повторите эти карточки ещё раз сегодня вечером:'));
          const ul = el('ul');
          missed.forEach(function (c) { ul.appendChild(el('li', '', c.q)); });
          box.appendChild(ul);
        }
        box.appendChild(button('Пройти заново', start));
        return;
      }
      const c = queue[0];
      box.appendChild(el('span', 'qnum', c.topic + ' · осталось карточек: ' + queue.length));
      box.appendChild(el('p', 'q', '<strong>' + c.q + '</strong>'));
      const answer = el('div', 'fb', c.a);
      answer.hidden = true;
      const row = el('div', 'grades');
      const reveal = button('Показать ответ', function () {
        answer.hidden = false;
        reveal.remove();
        row.appendChild(button('✓ Знал', function () {
          if (missed.indexOf(c) < 0) firstTry += 1;
          queue.shift();
          show();
        }));
        row.appendChild(button('✗ Не знал', function () {
          if (missed.indexOf(c) < 0) missed.push(c);
          queue.push(queue.shift());
          show();
        }));
        row.firstChild.focus();
      });
      row.appendChild(reveal);
      box.appendChild(row);
      box.appendChild(answer);
      reveal.focus();
    }
    start();
  }

  window.Course = { quiz: quiz, builder: builder, table: table, cards: cards, myExamples: myExamples, grade: grade, report: report };
};
window.createMatanCourse();
