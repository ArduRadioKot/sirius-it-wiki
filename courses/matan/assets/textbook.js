window.initMatanBook = function (material) {
  const chapters=window.MatanChapters;
  const route=window.MatanBookRoute;
  const chapterHref=id=>route?route.href(id):'#'+id;
  const chapterGo=id=>{location.hash=chapterHref(id);};
  const asset=path=>route?route.asset(path):path;
  const pageNumbers=[5,8,11,14,17,20];
  const lessonLinks=[['0002-ne-i-ili-esli-to','0003-kvantory-po-shagam','0004-kak-ustroena-teorema'],['0005-mnozhestva'],['0006-indukciya'],['0007-kombinatorika'],['0008-otnosheniya'],['0009-schetnye-mnozhestva','0010-teoremy-kantora']];
  const quizzes=[
    [{q:'Когда импликация A → B ложна?',options:['A ложно, B истинно','A истинно, B ложно','A и B ложны'],correct:1,why:'Обещание «если A, то B» нарушается ровно при истинном условии и ложном заключении.'},{q:'Как отрицать ∀x ∃y P(x,y)?',options:['∀x ∀y ¬P(x,y)','∃x ∀y ¬P(x,y)','∃x ∃y P(x,y)'],correct:1,why:'Оба квантора меняются на двойственные, а сам предикат отрицается. Порядок переменных сохраняется.'}],
    [{q:'Что означает A ⊆ B?',options:['A является элементом B','Каждый элемент A принадлежит B','Множества обязательно различны'],correct:1,why:'Включение означает ∀x (x ∈ A → x ∈ B). Равные множества также включены друг в друга.'},{q:'Чему равно дополнение A ∪ B?',options:['Ā ∩ B̄','Ā ∪ B̄','A ∩ B'],correct:0,why:'По закону де Моргана вне объединения находятся элементы, которые не входят ни в A, ни в B.'}],
    [{q:'Достаточно ли проверить утверждение для первых ста натуральных чисел?',options:['Да','Только если формула короткая','Нет, нужен переход к следующему числу'],correct:2,why:'Любое конечное число проверок не заменяет доказательство шага P(n) → P(n+1). Также необходима база.'},{q:'Чему равна сумма 1² + 2² + … + n²?',options:['n(n+1)/2','n(n+1)(2n+1)/6','n²(n+1)²/4'],correct:1,why:'В шаге индукции к формуле для n прибавляют (n+1)² и получают (n+1)(n+2)(2n+3)/6.'}],
    [{q:'Из пяти человек выбирают двух дежурных с одинаковой ролью. Сколько способов?',options:['20','10','25'],correct:1,why:'Порядок не важен и повторений нет: C(5,2) = 5·4/2 = 10.'},{q:'Как посчитать |A ∪ B| для конечных множеств?',options:['|A| + |B|','|A| + |B| − |A ∩ B|','|A| · |B|'],correct:1,why:'Общие элементы посчитаны дважды, поэтому один раз вычитаем пересечение.'}],
    [{q:'Какие свойства определяют отношение эквивалентности?',options:['Рефлексивность, симметричность, транзитивность','Рефлексивность и антисимметричность','Только транзитивность'],correct:0,why:'Все три свойства нужны, чтобы классы эквивалентности образовывали разбиение.'},{q:'Функция f: ℕ → ℕ, f(n)=n+1 при ℕ={1,2,…} является…',options:['Биекцией','Инъекцией, но не сюръекцией','Сюръекцией, но не инъекцией'],correct:1,why:'Разные n дают разные значения, но 1 не имеет прообраза в ℕ.'}],
    [{q:'Что утверждает теорема Кантора?',options:['Все бесконечные множества равномощны','|A| < |𝒫(A)| для любого A','ℚ несчётно'],correct:1,why:'Инъекция a ↦ {a} существует, а сюръекция A → 𝒫(A) невозможна: множество D={a∈A: a∉f(a)} не имеет прообраза.'},{q:'Почему существуют трансцендентные действительные числа?',options:['Алгебраические числа счётны, а ℝ несчётно','Все иррациональные числа трансцендентны','Многочлены не имеют действительных корней'],correct:0,why:'Многочленов с целыми коэффициентами счётно много; каждый ненулевой многочлен имеет конечное число корней. Эти корни не исчерпывают ℝ.'}]
  ];
  const key='sirius-matan-book-v1';
  const read=()=>{try{const v=JSON.parse(localStorage.getItem(key));return v && typeof v==='object' && !Array.isArray(v)?v:{};}catch{return {};}};
  let state=read(), current=0;
  if(!state.chapters || typeof state.chapters!=='object')state.chapters={};
  function save(){try{localStorage.setItem(key,JSON.stringify(state));document.querySelector('#book-status').textContent='Сохранено в этом браузере.';}catch{document.querySelector('#book-status').textContent='Хранилище недоступно. Эта сессия работает без сохранения.';}}
  const $=s=>document.querySelector(s);
  const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function addVisuals(article) {
    const { figures, example } = material.visuals;
    const headings = [...article.querySelectorAll('h3')];
    function addAfterSection(title, element) {
      const index = headings.findIndex(heading => heading.textContent.trim() === title);
      const nextHeading = index >= 0 ? headings[index + 1] : null;
      if (nextHeading) nextHeading.before(element);
      else article.append(element);
    }

    const viewer = document.createElement('dialog');
    viewer.className = 'textbook-figure-view';
    viewer.setAttribute('aria-label', 'Увеличенная схема');
    viewer.innerHTML = '<form method="dialog"><button class="btn" type="submit" autofocus>Закрыть</button></form><div class="textbook-figure-scroll" tabindex="0" aria-label="Область просмотра схемы"><img alt=""></div><p></p>';
    for (const diagram of figures) {
      const figure = document.createElement('figure');
      figure.className = 'textbook-figure';
      const url = asset('../../assets/diagrams/' + diagram.file);
      figure.innerHTML = `<button class="textbook-figure-button" type="button" aria-label="Увеличить схему: ${escape(diagram.alt)}"><img src="${escape(url)}" width="1000" height="${diagram.height || 440}" loading="lazy" alt="${escape(diagram.alt)}"><span aria-hidden="true">Увеличить</span></button><figcaption>${escape(diagram.caption)}</figcaption>`;
      figure.querySelector('button').onclick = () => {
        const image = viewer.querySelector('img');
        image.src = url;
        image.alt = diagram.alt;
        viewer.querySelector('p').textContent = diagram.caption;
        viewer.showModal();
        image.parentElement.scrollLeft = 0;
      };
      addAfterSection(diagram.after, figure);
    }

    const worked = document.createElement('aside');
    worked.className = 'textbook-worked';
    worked.innerHTML = `<h4>Разбор задачи</h4><p>${escape(example.question)}</p><details><summary>Показать решение</summary><ol>${example.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><p><strong>Ответ.</strong> ${escape(example.answer)}</p></details>`;
    addAfterSection(example.after, worked);
    article.append(viewer);
  }

  function renderCantorTable(root) {
    const rows = [[0, 0, 1, 0], [1, 1, 1, 0], [0, 1, 0, 0], [1, 0, 1, 1]];
    const target = root.querySelector('#diagonal');
    target.innerHTML = `<table class="textbook-diagonal"><caption>Первые четыре строки предполагаемого списка</caption><thead><tr><th scope="col">Строка</th>${rows.map((_, index) => `<th scope="col">${index + 1}</th>`).join('')}<th scope="col">Дальше</th></tr></thead><tbody>${rows.map((row, index) => `<tr><th scope="row">a<sub>${index + 1}</sub></th>${row.map((bit, column) => column === index ? `<td><button class="slot" type="button" data-diagonal="${index}">${bit}</button></td>` : `<td>${bit}</td>`).join('')}<td>…</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Новая b</th>${rows.map(() => '<td></td>').join('')}<td>…</td></tr></tfoot></table>`;
    const buttons = [...target.querySelectorAll('[data-diagonal]')];
    const resultCells = target.querySelectorAll('tfoot td');
    const output = root.querySelector('.lab-output');
    function updateDiagonal() {
      const result = rows.map((row, index) => {
        const bit = row[index];
        buttons[index].textContent = bit;
        buttons[index].setAttribute('aria-label', `Строка ${index + 1}, столбец ${index + 1}: ${bit}. Изменить цифру`);
        resultCells[index].textContent = 1 - bit;
        return 1 - bit;
      });
      output.textContent = `Новая последовательность b = ${result.join('')}… Она отличается от строки a₁ в позиции 1, от a₂ в позиции 2 и так далее.`;
    }
    buttons.forEach((button, index) => {
      button.onclick = () => {
        rows[index][index] = 1 - rows[index][index];
        updateDiagonal();
      };
    });
    updateDiagonal();
  }

  function nav(){ $('#chapters').innerHTML=chapters.map((c,i)=>`<a href="${chapterHref(c.id)}" aria-current="${i===current}">${escape(c.title)}<small>${state.chapters[c.id]?.read?'✓ Прочитано':''} ${state.chapters[c.id]?.bookmark?'★ Закладка':''}</small></a>`).join(''); }
  function render(){
    let idx=chapters.findIndex(c=>route?c.id===route.chapter:'#'+c.id===location.hash);
    current=idx>=0?idx:Math.max(0,chapters.findIndex(c=>c.id===state.last));
    const chapter=chapters[current];state.last=chapter.id;
    const data=state.chapters[chapter.id]||{};
    $('#chapter').innerHTML=`<h2>${escape(chapter.title)}</h2>`+material.html;
    // Keep proof steps available on demand, without hiding definitions.
    $('#chapter').querySelectorAll('p').forEach(p=>{
      if(/^Доказательство[:.]/i.test(p.textContent.trim())){const d=document.createElement('details');const s=document.createElement('summary');s.textContent='Идея доказательства';p.before(d);d.append(s,p);}
    });
    addVisuals($('#chapter'));
    const links=document.createElement('p');links.className='note';links.innerHTML='Практика по главе: '+lessonLinks[current].map((slug,i)=>`<a href="${route?route.page("lessons/"+slug):"lessons/"+slug+".html"}">Тренажёр ${i+1}</a>`).join(' · ');$('#chapter').append(links);
    $('#chapter-note').value=data.note||'';
    $('#bookmark').textContent=data.bookmark?'★ В закладках':'В закладки';$('#bookmark').setAttribute('aria-pressed',String(Boolean(data.bookmark)));
    $('#read-chapter').textContent=data.read?'✓ Прочитано':'Отметить прочитанной';$('#read-chapter').setAttribute('aria-pressed',String(Boolean(data.read)));
    $('#prev-chapter').disabled=current===0;$('#next-chapter').disabled=current===chapters.length-1;
    $('#original').open=false;$('#pdf-view').replaceChildren();
    $('#pdf-link').href=asset(`../../articles/files/matan-colloquium-2026.pdf#page=${pageNumbers[current]}`);
    $('#chapter-quiz').replaceChildren();
    Course.quiz('#chapter-quiz','Глава '+(current+1),quizzes[current].map((q,i)=>({...q,tag:`${chapter.id}-${i}`})));
    $('#book-status').textContent='';nav();lab();
    try{localStorage.setItem(key,JSON.stringify(state));}catch{}
  }
  function mutate(field,value){const id=chapters[current].id;state.chapters[id]={...state.chapters[id],[field]:value};save();nav();if(field!=='note')route?.updateNav?.();}
  function syncFlags(){const data=state.chapters[chapters[current].id]||{};$('#bookmark').textContent=data.bookmark?'★ В закладках':'В закладки';$('#bookmark').setAttribute('aria-pressed',String(Boolean(data.bookmark)));$('#read-chapter').textContent=data.read?'✓ Прочитано':'Отметить прочитанной';$('#read-chapter').setAttribute('aria-pressed',String(Boolean(data.read)));}
  $('#bookmark').onclick=()=>{mutate('bookmark',!state.chapters[chapters[current].id]?.bookmark);syncFlags();};
  $('#read-chapter').onclick=()=>{mutate('read',!state.chapters[chapters[current].id]?.read);syncFlags();};
  $('#chapter-note').oninput=e=>mutate('note',e.target.value);
  $('#prev-chapter').onclick=()=>{if(current>0)chapterGo(chapters[current-1].id);};
  $('#next-chapter').onclick=()=>{if(current<5)chapterGo(chapters[current+1].id);};
  $('#print-book').onclick=()=>window.print();
  $('#original').ontoggle=()=>{if($('#original').open&&!$('#pdf-view iframe')){const f=document.createElement('iframe');f.title='Оригинал учебника, глава '+(current+1);f.src=$('#pdf-link').href;$('#pdf-view').append(f);}};
  const plain = chapters.map(chapter => chapter.keywords);
  $('#book-search').oninput=e=>{
    const q=e.target.value.trim().toLocaleLowerCase('ru');$('#search-results').replaceChildren();if(q.length<2)return;
    const matches=chapters.map((c,i)=>({c,i,pos:plain[i].toLocaleLowerCase('ru').indexOf(q)})).filter(m=>m.pos>=0);
    if(!matches.length){$('#search-results').textContent='Ничего не найдено. Попробуй другое слово.';return;}
    for(const m of matches){const a=document.createElement('a');a.className='search-result';a.href=chapterHref(m.c.id);const title=document.createElement('strong');title.textContent=m.c.title;const excerpt=document.createElement('div');excerpt.textContent='…'+plain[m.i].slice(Math.max(0,m.pos-40),m.pos+130)+'…';a.append(title,excerpt);a.onclick=()=>{if(current===m.i)$('#chapter').focus();};$('#search-results').append(a);}
  };
  function lab(){
    const root=$('#lab');
    const layouts=[
      '<h3>Поменяй значения, проверь обещание</h3><p>A → B ложно только при A=1 и B=0.</p><div class="lab-grid"><label>A<select id="a"><option>0</option><option>1</option></select></label><label>B<select id="b"><option>0</option><option>1</option></select></label></div><div class="lab-output" aria-live="polite"></div>',
      '<h3>Множества на диаграмме</h3><label>Операция <select id="op"><option value="union">Объединение A ∪ B</option><option value="intersection">Пересечение A ∩ B</option><option value="difference">Разность A ∖ B</option><option value="xor">Симметрическая разность A △ B</option></select></label><svg class="venn-live" viewBox="0 0 340 210" role="img" aria-label="Диаграмма выбранной операции"><defs><clipPath id="clip-left"><circle cx="125" cy="105" r="70"/></clipPath><mask id="only-left"><rect width="340" height="210" fill="white"/><circle cx="215" cy="105" r="70" fill="black"/></mask><mask id="only-right"><rect width="340" height="210" fill="white"/><circle cx="125" cy="105" r="70" fill="black"/></mask></defs><g fill="#05b7b0" fill-opacity=".45"><circle id="left-region" cx="125" cy="105" r="70" mask="url(#only-left)"/><circle id="right-region" cx="215" cy="105" r="70" mask="url(#only-right)"/><circle id="both-region" cx="215" cy="105" r="70" clip-path="url(#clip-left)"/></g><circle class="outline" cx="125" cy="105" r="70"/><circle class="outline" cx="215" cy="105" r="70"/><text x="82" y="25">A</text><text x="240" y="25">B</text></svg><p class="lab-output" aria-live="polite"></p>',
      '<h3>От суммы к формуле</h3><label>Число слагаемых n <input id="n" type="range" min="1" max="12" value="4"></label><div class="lab-output" aria-live="polite"></div><p class="note">Проверка примеров помогает понять формулу. Доказательство для всех n требует базы и шага индукции.</p>',
      '<h3>Как выбрать нужную формулу</h3><div class="lab-grid"><label>Всего n<input id="n" type="number" min="1" max="20" value="5"></label><label>Берём k<input id="k" type="number" min="0" max="20" value="2"></label><label><span>Порядок важен</span><input id="ordered" type="checkbox"></label><label><span>Повторения разрешены</span><input id="repeat" type="checkbox"></label></div><div class="lab-output" aria-live="polite"></div>',
      '<h3>Посмотри на стрелки функции</h3><label>Функция из {1,2,3} в {1,2,3,4}<select id="mapping"><option value="identity">f(x)=x</option><option value="constant">f(x)=1</option><option value="shift">f(x)=x+1</option></select></label><div class="lab-output" aria-live="polite"></div>',
      '<h3>Измени цифру на диагонали</h3><p>Здесь показан конечный фрагмент списка двоичных последовательностей. Нажимай на диагональные цифры: новая последовательность всегда отличается от строки i в позиции i.</p><div id="diagonal" class="tablewrap"></div><div class="lab-output" aria-live="polite"></div><p class="note">В доказательстве этот приём применяется к предполагаемому бесконечному списку: bᵢ=1−aᵢᵢ. Поэтому b отсутствует во всём списке.</p>'
    ];root.innerHTML=layouts[current];
    const out=root.querySelector('.lab-output');
    const value=id=>Number(root.querySelector('#'+id).value);
    const factorial=n=>{let r=1n;for(let j=2;j<=n;j++)r*=BigInt(j);return r;};
    const choose=(n,k)=>{let r=1n;for(let j=1;j<=Math.min(k,n-k);j++)r=r*BigInt(n-j+1)/BigInt(j);return r;};
    function update(){
      if(current===0){const a=value('a'),b=value('b');out.textContent=`¬A = ${1-a} · A ∧ B = ${a&&b} · A ∨ B = ${a||b} · A → B = ${Number(!a||b)}`;}
      if(current===1){const op=root.querySelector('#op').value;root.querySelector('#left-region').style.display=op==='intersection'?'none':'';root.querySelector('#right-region').style.display=['union','xor'].includes(op)?'':'none';root.querySelector('#both-region').style.display=['union','intersection'].includes(op)?'':'none';out.textContent={union:'Берём всё, что входит хотя бы в одно множество.',intersection:'Берём только общую часть.',difference:'Берём часть A, которая не входит в B.',xor:'Берём элементы ровно одного из двух множеств.'}[op];}
      if(current===2){const n=value('n');out.textContent=`n=${n}: `+Array.from({length:n},(_,i)=>(i+1)+'²').join(' + ')+` = ${n*(n+1)*(2*n+1)/6}. По формуле: ${n}·${n+1}·${2*n+1}/6.`;}
      if(current===3){const n=value('n'),k=value('k'),ord=root.querySelector('#ordered').checked,rep=root.querySelector('#repeat').checked;if(!Number.isInteger(n)||!Number.isInteger(k)||n<1||n>20||k<0||k>20){out.textContent='Введи целые n от 1 до 20 и k от 0 до 20.';return;}if(!rep&&k>n){out.textContent='Без повторений нельзя выбрать больше элементов, чем есть: 0 способов.';return;}const formula=ord?(rep?'nᵏ':'n!/(n−k)!'):(rep?'C(n+k−1,k)':'C(n,k)');const result=ord?(rep?BigInt(n)**BigInt(k):factorial(n)/factorial(n-k)):(rep?choose(n+k-1,k):choose(n,k));out.textContent=`${formula} = ${result.toLocaleString('ru-RU',{maximumFractionDigits:0})}`;}
      if(current===4){const mode=root.querySelector('#mapping').value;const ys=[1,2,3].map(x=>mode==='constant'?1:mode==='shift'?x+1:x);out.textContent=[1,2,3].map((x,i)=>`${x} → ${ys[i]}`).join('   ·   ')+`. ${new Set(ys).size===3?'Инъекция: разные элементы имеют разные образы.':'Не инъекция: разные элементы имеют одинаковый образ.'} Не сюръекция: ${[1,2,3,4].filter(y=>!ys.includes(y)).join(', ')} не имеют прообраза.`;}
    }
    root.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',update));
    if (current === 5) renderCantorTable(root);
    else update();
  }
  if(!route)window.addEventListener('hashchange',()=>{render();$('#chapter').focus();});render();
};
