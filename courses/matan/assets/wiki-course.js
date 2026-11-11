(() => {
 const home='#/study/matan';
 const href=(page='index',extra={})=>home+'?'+new URLSearchParams({page,...extra});
 const base=()=>new URL('courses/matan/',document.querySelector('script[src$="app.js"]').src.replace(/app\.js$/,''));
 const originals = {
  textbook: {
   title: 'Учебник к коллоквиуму',
   description: 'Все доказательства, примеры, дополнительные задачи и фотографии записей',
   pdf: 'matan-colloquium-2026.pdf',
  },
  lectures: {
   title: 'Конспект лекций',
   description: 'Все страницы лекционного конспекта Ани Пыженко',
   pdf: 'matan-lecture-notes-2026-11-01.pdf',
  },
  answers: {
   title: 'Ответы к коллоквиуму',
   description: 'Определения, формулировки и доказательства по всем 26 вопросам',
   pdf: 'matan-colloquium-answers-2026.pdf',
   docx: 'matan-colloquium-answers-2026.docx',
  },
 };
 const materialUrl = file => new URL('../../articles/files/' + file, base());
 const resources=[['reference/kartochki','87 карточек'],['reference/karta-kollokviuma','Все 26 вопросов'],['reference/vse-konspekty','Все конспекты'],['reference/kvantory-shpargalka','Логика и кванторы'],['reference/bukvy-i-znachki','Буквы и обозначения'],['reference/kak-otvechat-na-bilet','Как отвечать на билет']];
 const lessons=[['0002-ne-i-ili-esli-to','Логические операции'],['0003-kvantory-po-shagam','Предикаты и кванторы'],['0004-kak-ustroena-teorema','Структура теорем'],['0005-mnozhestva','Множества'],['0006-indukciya','Индукция'],['0007-kombinatorika','Комбинаторика'],['0008-otnosheniya','Отношения и функции'],['0009-schetnye-mnozhestva','Счётные множества'],['0010-teoremy-kantora','Теоремы Кантора']];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=()=>{try{const v=JSON.parse(localStorage.getItem('sirius-matan-progress-v1'));return v&&typeof v==='object'?v:{};}catch{return {};}};
 const save=v=>{try{localStorage.setItem('sirius-matan-progress-v1',JSON.stringify(v));}catch{}};
 let active=null,revision=0;
 window.addEventListener('course-result',e=>{if(!active)return;const state=read();state[active]={...state[active],result:e.detail};save(state);});
 function fixLinks(root,page){
  const origin=new URL(page+'.html',base());
  root.querySelectorAll('a[href]').forEach(a=>{
   const raw=a.getAttribute('href');if(raw.startsWith(home))return;
   const url=new URL(raw,origin);if(url.origin!==location.origin)return;
   const rel=url.pathname.slice(base().pathname.length).replace(/\.html$/,'');
   if(url.pathname.startsWith(base().pathname)&&window.MatanPages[rel]){
    a.href=href(rel,url.hash?{anchor:url.hash.slice(1)}:{});a.removeAttribute('target');
   }else if(raw.startsWith('#')&&!raw.startsWith('#/')){a.href=href(page,{anchor:raw.slice(1)});a.removeAttribute('target');}
   else a.href=url.href;
  });
  root.querySelectorAll('[src]').forEach(node=>{if(!node.getAttribute('src').startsWith('http'))node.src=new URL(node.getAttribute('src'),origin).href;});
 }
 function bookState(){try{return JSON.parse(localStorage.getItem('sirius-matan-book-v1'))||{};}catch{return {};}}
 function sidebar(page,chapter){const state=read();const book=bookState();const link=(id,label,extra={})=>`<a class="matan-nav-link ${page===id&&(!extra.chapter||extra.chapter===chapter)?'active':''}" href="${href(id,extra)}" ${page===id&&(!extra.chapter||extra.chapter===chapter)?'aria-current="page"':''}>${esc(label)}</a>`;
 return `<p class="sidebar-title">Математический анализ</p>${link('index','Обзор курса')}<p class="matan-nav-label">Уроки</p>${lessons.map(([id,label],i)=>link('lessons/'+id,`${i+1}. ${label}${state[id]?.complete?' ✓':''}`)).join('')}${link('lessons/0001-otricanie-s-kvantorami','Практикум: отрицания')}<p class="matan-nav-label">Интерактивный учебник</p>${window.MatanChapters.map(c=>link('textbook',c.title+(book.chapters?.[c.id]?.bookmark?' ★':'')+(book.chapters?.[c.id]?.read?' ✓':''),{chapter:c.id})).join('')}<p class="matan-nav-label">Полные материалы</p>${link('original-textbook','Учебник · все 69 страниц')}${link('original-lectures','Лекции · все 24 страницы')}${link('original-answers','Ответы на 26 вопросов')}<p class="matan-nav-label">Повторение и справочники</p>${resources.map(([id,label])=>link(id,label)).join('')}`;
 }
 function dashboard(root){const state=read();const done=lessons.filter(([id])=>state[id]?.complete).length;const last=lessons.find(([id])=>id===state.last)||lessons[0];const section=document.createElement('section');section.className='matan-dashboard';section.innerHTML=`<div><span class="eyebrow">Твой прогресс</span><h2>${done} из 9 уроков</h2><progress value="${done}" max="9" aria-label="Пройдено уроков"></progress></div><div class="matan-actions"><a class="matan-button primary" href="${href('lessons/'+last[0])}">Продолжить обучение →</a><a class="matan-button" href="${href('textbook')}">Интерактивный учебник</a><a class="matan-button" href="${href('original-textbook')}">Читать весь учебник</a><a class="matan-button" href="${href('original-lectures')}">Все записи лекций</a><a class="matan-button" href="${href('original-answers')}">Ответы на 26 вопросов</a></div>`;root.querySelector('.meta').after(section);}
 function lessonTools(root,page){const name=page.split('/').pop();active=name;let state=read();state.last=name;save(state);
 root.querySelectorAll('textarea').forEach((area,i)=>{const key=`sirius-matan-draft:${name}:${i}`;try{area.value=localStorage.getItem(key)||'';}catch{}area.dispatchEvent(new Event('input'));area.addEventListener('input',()=>{try{localStorage.setItem(key,area.value);}catch{}});});
 const button=document.createElement('button');button.type='button';button.className='matan-button';
 const update=()=>{const done=!!read()[name]?.complete;button.textContent=done?'✓ Урок пройден':'Отметить урок пройденным';button.setAttribute('aria-pressed',String(done));};update();button.onclick=()=>{state=read();state[name]={...state[name],complete:!state[name]?.complete};save(state);update();const side=document.querySelector('.matan-sidebar');side.querySelector('nav').innerHTML=sidebar(page);};root.append(button);
 const i=lessons.findIndex(([id])=>id===name);
 if(i>=0){
  const lessonRoute = step => lessons[i+step] && href('lessons/'+lessons[i+step][0]);
  SiriusSwipe.setRoutes(root, lessonRoute(-1), lessonRoute(1));
 }
if(i>=0){const nav=document.createElement('nav');nav.className='lesson-nav';nav.setAttribute('aria-label','Переход между уроками');for(const j of [i-1,i+1])if(lessons[j]){const a=document.createElement('a');a.className='matan-button';a.href=href('lessons/'+lessons[j][0]);a.textContent=(j<i?'← ':'')+lessons[j][1]+(j>i?' →':'');nav.append(a);}root.append(nav);}
 }
 function original(root,kind,params,pages){
  const n=Math.min(pages.length,Math.max(1,Math.trunc(Number(params.get('n'))||1)));const material = originals[kind];
  const topics = kind === 'answers' ? window.MatanAnswerTopics : [];
  root.innerHTML=`<span class="eyebrow">${kind === 'answers' ? 'Версия с исправлениями' : 'Полный оригинал'} · ${pages.length} страниц</span><h1>${material.title}</h1><p class="meta">${material.description}</p><div class="matan-reader-controls"><label>Страница <input id="original-page" type="number" min="1" max="${pages.length}" value="${n}"></label><button class="matan-button" id="original-go">Перейти</button><button class="matan-button" id="original-prev" ${n===1?'disabled':''}>←</button><button class="matan-button" id="original-next" ${n===pages.length?'disabled':''}>→</button><button class="matan-button" id="original-zoom">Увеличить</button><a class="matan-button" href="${materialUrl(material.pdf)}" download>Скачать PDF</a>${material.docx ? `<a class="matan-button" href="${materialUrl(material.docx)}" download>Исходный Word</a>` : ''}</div>
  ${topics.length ? `<p><label>Вопрос <select id="answer-topic"><option value="">Выбрать из 26 вопросов</option>${topics.map(topic => `<option value="${topic.page}">${esc(topic.title)}</option>`).join('')}</select></label></p>` : ''}
  <label for="original-search">Поиск по всем страницам этого материала</label><input id="original-search" type="search" placeholder="Теорема, определение, пример…"><div id="original-results" aria-live="polite"></div><figure class="matan-original"><img src="${new URL('../../'+pages[n-1].image,base())}" alt="${material.title}, страница ${n}" width="1131" height="1600"><figcaption>Страница ${n} из ${pages.length}</figcaption></figure><details><summary>Текст страницы для поиска и копирования</summary><pre class="matan-extracted">${esc(pages[n-1].text.trim()||'На странице находятся фотографии рукописных записей. Они полностью доступны на изображении выше.')}</pre><p class="note">Формулы и расположение таблиц сверяй с оригиналом страницы.</p></details><dialog class="matan-zoom"><button class="matan-button" autofocus>Закрыть</button><img alt="Увеличенная страница ${n}" src="${new URL('../../'+pages[n-1].image,base())}"></dialog>`;
  const pageRoute = value => href('original-'+kind, {n: String(Math.min(pages.length, Math.max(1, Math.trunc(Number(value)||1))))});
  const go = value => { location.hash = pageRoute(value); };
  SiriusSwipe.setRoutes(root, n > 1 && pageRoute(n-1), n < pages.length && pageRoute(n+1));
  const topicPicker = root.querySelector('#answer-topic');
  if (topicPicker) topicPicker.onchange = () => {
   if (topicPicker.value) go(topicPicker.value);
  };
  root.querySelector('#original-go').onclick=()=>go(root.querySelector('#original-page').value);
  root.querySelector('#original-page').onkeydown=e=>{if(e.key==='Enter')go(e.target.value);};
  root.querySelector('#original-prev').onclick=()=>go(n-1);root.querySelector('#original-next').onclick=()=>go(n+1);
  const dialog=root.querySelector('dialog');root.querySelector('#original-zoom').onclick=()=>dialog.showModal();dialog.querySelector('button').onclick=()=>dialog.close();
  root.querySelector('#original-search').oninput=e=>{const q=e.target.value.trim().toLocaleLowerCase('ru');const results=root.querySelector('#original-results');results.replaceChildren();if(q.length<2)return;let found=0;pages.forEach((p,i)=>{const offset=p.text.toLocaleLowerCase('ru').indexOf(q);if(offset<0)return;found++;const a=document.createElement('a');a.className='matan-search-result';a.href=href('original-'+kind,{n:String(i+1)});a.textContent=`Страница ${i+1} · …${p.text.slice(Math.max(0,offset-35),offset+100)}…`;results.append(a);});if(!found)results.textContent='Не найдено. Рукописные страницы можно просмотреть на изображениях.';};
 }
 async function loadMaterial(file) {
  const response = await fetch(new URL(file, base()));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${file}`);
  return response.json();
 }

 function searchPages() {
  const catalog = Object.entries(window.MatanPages).map(([page, entry]) => ({
   title: entry.title,
   keywords: entry.keywords,
   href: href(page),
  }));
  for (const chapter of window.MatanChapters) {
   catalog.push({ title: chapter.title, keywords: chapter.keywords, href: href('textbook', { chapter: chapter.id }) });
  }
  for (const [kind, material] of Object.entries(originals)) {
   catalog.push({ title: material.title, description: material.description, href: href('original-' + kind) });
  }
  for (const topic of window.MatanAnswerTopics) {
   catalog.push({ title: topic.title, description: originals.answers.title, href: href('original-answers', { n: topic.page }) });
  }
  return catalog.map(item => ({ ...item, type: 'page', subject: 'Математический анализ' }));
 }
 async function render(params){const ticket=++revision;const hash=location.hash;active=null;let page=params.get('page')||'index';let chapter=params.get('chapter');if(!chapter)chapter=bookState().last;if(!window.MatanChapters.some(c=>c.id===chapter))chapter='t1';const root=document.getElementById('app');
 if(!window.MatanPages[page]&&!(page.startsWith('original-') && Object.hasOwn(originals, page.slice(9))))page='index';
 root.innerHTML=`<section class="page matan-page"><a class="back-link" href="#/study"><span class="icon icon-arrow-left" aria-hidden="true"></span>Учёба</a><div class="matan-layout"><aside class="sidebar matan-sidebar" aria-label="Навигация по курсу"><details class="matan-course-toc" ${innerWidth>900?'open':''}><summary>Содержание курса</summary><nav>${sidebar(page,chapter)}</nav></details></aside><article class="markdown matan-content"></article></div></section>`;
 const content=root.querySelector('.matan-content');
 content.innerHTML = '<p role="status">Загружаем материал…</p>';
 const current = () => ticket === revision && hash === location.hash && content.isConnected;
 if (page.startsWith('original-')) {
  const kind = page.slice(9);
  const pages = await loadMaterial(window.MatanOriginals[kind].file);
  if (current()) original(content, kind, params, pages);
  return;
 }
 const entry = window.MatanPages[page];
 const pageModule = await import(new URL(entry.modulePath, base()).href);
 if (!current()) return;
 const material = page === 'textbook' ? await loadMaterial(window.MatanChapters.find(item => item.id === chapter).file) : null;
 if (!current()) return;
 content.innerHTML = pageModule.default.html;
 content.querySelectorAll('table').forEach(table=>{if(!table.parentElement.classList.contains('tablewrap')){const wrap=document.createElement('div');wrap.className='tablewrap';table.before(wrap);wrap.append(table);}});
 // Inline lesson diagrams retain their original rules, scoped to this course.
 for(const css of pageModule.default.styles){const style=document.createElement('style');style.textContent=css.replace(/(^|})\s*([^@{}][^{]+)\{/g,(_,close,selectors)=>close+' '+selectors.split(',').map(s=>'.matan-content '+s.trim()).join(',')+'{');content.prepend(style);}
 window.createMatanCourse();
 pageModule.initialize?.(window.Course);
 if(page==='index')dashboard(content);
 if(page.startsWith('lessons/'))lessonTools(content,page);
 if(page==='textbook'){
  const chapterIndex = window.MatanChapters.findIndex(item => item.id === chapter);
  const chapterRoute = step => {
   const adjacent = window.MatanChapters[chapterIndex + step];
   return adjacent && href('textbook', {chapter: adjacent.id});
  };
  SiriusSwipe.setRoutes(content, chapterRoute(-1), chapterRoute(1));
  window.MatanBookRoute={chapter,href:id=>href('textbook',{chapter:id}),page:id=>href(id),asset:path=>new URL(path,base()).href,updateNav:()=>{root.querySelector('.matan-sidebar nav').innerHTML=sidebar(page,chapter);}};window.initMatanBook(material);
  const answer = window.MatanAnswerTopics.find(topic => topic.title.startsWith(`${chapterIndex + 1}.1.`));
  const answerLink = document.createElement('a');
  answerLink.className = 'matan-button';
  answerLink.href = href('original-answers', { n: String(answer.page) });
  answerLink.textContent = 'Ответы к коллоквиуму по этой теме';
  content.querySelector('#original').before(answerLink);
  const originalLink=document.createElement('a');originalLink.className='matan-button';originalLink.href=href('original-textbook',{n:String([5,8,11,14,17,20][Number(chapter.slice(1))-1]||5)});originalLink.textContent='Полный учебник: читать страницы внутри вики →';content.querySelector('#original').before(originalLink);
 }
 fixLinks(content,page);
 const anchor=params.get('anchor');if(anchor)requestAnimationFrame(()=>{if(ticket===revision)document.getElementById(anchor)?.scrollIntoView({block:'start'});});
 }
 window.SiriusMatan={render,href,searchPages};
})();
