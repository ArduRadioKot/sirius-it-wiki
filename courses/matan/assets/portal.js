(() => {
  const source=new URL('../',document.querySelector('script[src*="portal.js"]').src);
  const page=location.pathname.slice(source.pathname.length).replace(/\.html$/,'')||'index';
  const params=new URLSearchParams({page});
  if(location.hash && page==='textbook')params.set('chapter',location.hash.slice(1));
  else if(location.hash)params.set('anchor',location.hash.slice(1));
  location.replace(new URL('../../',source).href+'#/study/matan?'+params);
  return;
  const lessons = [
    ['0002-ne-i-ili-esli-to','Логические операции'], ['0003-kvantory-po-shagam','Предикаты и кванторы'],
    ['0004-kak-ustroena-teorema','Структура теорем'], ['0005-mnozhestva','Множества'],
    ['0006-indukciya','Индукция'], ['0007-kombinatorika','Комбинаторика'],
    ['0008-otnosheniya','Отношения и функции'], ['0009-schetnye-mnozhestva','Счётные множества'],
    ['0010-teoremy-kantora','Теоремы Кантора']
  ];
  const base = new URL('../', document.querySelector('script[src*="portal.js"]').src);
  const wiki = new URL('../../', base);
  const name = location.pathname.split('/').pop().replace('.html','');
  const index = lessons.findIndex(l => l[0] === name);
  const key = 'sirius-matan-progress-v1';
  const read = () => { try { const v=JSON.parse(localStorage.getItem(key)); return v && typeof v==='object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
  const save = value => { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  const header = document.createElement('header');
  header.className='course-header';
  header.innerHTML=`<a class="course-brand" href="${wiki.href}#/study"><img src="${wiki.href}assets/sirius-logo.svg" alt="Сириус Wiki"></a><nav aria-label="Разделы курса"><a href="${base.href}">Курс</a><a href="${base.href}textbook.html">Учебник</a><a href="${base.href}reference/kartochki.html">Карточки</a><a href="${wiki.href}#/study">Вики ↗</a></nav><button class="btn" data-theme-toggle type="button" aria-label="Сменить тему">Тема</button>`;
  document.body.prepend(header);
  header.querySelector('[data-theme-toggle]').onclick=()=>window.setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  const main=document.querySelector('main');
  const state=read();
  // Quiz results persist as a summary; a new attempt keeps answers hidden.
  window.addEventListener('course-result', e => {
    const data=read(); data[name]={...data[name],result:e.detail}; save(data);
  });
  if(index>=0 || name==='0001-otricanie-s-kvantorami') {
    const data=read(); data.last=name; save(data);
    const panel=document.createElement('div'); panel.className='reader-tools';
    const complete=document.createElement('button'); complete.type='button'; complete.className='btn';
    let done=Boolean(state[name]?.complete);
    const update=()=> {complete.textContent=done?'✓ Урок пройден':'Отметить урок пройденным';complete.setAttribute('aria-pressed',String(done));};update();
    complete.onclick=()=>{done=!done; const data=read();data[name]={...data[name],complete:done};save(data);update();};
    panel.append(complete);
    if(state[name]?.result) {const note=document.createElement('p');note.className='note';note.textContent=`Предыдущая попытка: ${state[name].result.right} из ${state[name].result.total}. Текущая попытка начинается заново.`;panel.append(note);}
    main.append(panel);
    // Restore personal written answers independently from checked quiz answers.
    main.querySelectorAll('textarea').forEach((area,i)=>{
      const field=`sirius-matan-draft:${name}:${i}`;
      try {area.value=localStorage.getItem(field)||'';}catch{}
      area.addEventListener('input',()=>{try{localStorage.setItem(field,area.value);}catch{}});
    });
    if(index>=0){const nav=document.createElement('nav');nav.className='lesson-nav';nav.setAttribute('aria-label','Переход между уроками');
      for(const j of [index-1,index+1]) if(lessons[j]){const a=document.createElement('a');a.className='btn';a.href=new URL(`lessons/${lessons[j][0]}.html`,base);a.textContent=(j<index?'← ':'')+lessons[j][1]+(j>index?' →':'');nav.append(a);}main.append(nav);}
  }
  if(name==='index' || !name){
    const count=lessons.filter(l=>state[l[0]]?.complete).length;
    const panel=document.createElement('section');panel.className='course-dashboard';
    const last=lessons.find(l=>l[0]===state.last)||lessons.find(l=>!state[l[0]]?.complete)||lessons[0];
    panel.innerHTML=`<div><span class="eyebrow">Твой прогресс</span><h2>${count} из 9 уроков</h2><progress value="${count}" max="9" aria-label="Пройдено уроков"></progress></div><div class="course-actions"><a class="btn primary" href="${base.href}lessons/${last[0]}.html">Продолжить: ${last[1]} →</a><a class="btn" href="${base.href}textbook.html">Открыть интерактивный учебник</a><a class="btn" href="${wiki.href}articles/files/matan-colloquium-2026.pdf">Скачать учебник · PDF</a></div>`;
    main.querySelector('.meta').after(panel);
    main.querySelectorAll('table tbody tr').forEach((row,i)=>{if(state[lessons[i]?.[0]]?.complete)row.lastElementChild.append(' · ✓ Пройден');});
  }
})();
