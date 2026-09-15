(() => {
  const base=new URL('./',document.currentScript.src);
  const status=document.getElementById('offlineStatus'), button=document.getElementById('installApp');
  let prompt=null, ready=false;
  const paint=()=>{status.textContent=ready?(navigator.onLine?'Готово к работе без интернета':'Без интернета · сохранённые данные'):(navigator.onLine?'Подготовка офлайн-режима…':'Для первого сохранения нужен интернет');};
  const installed=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if(installed()) button.hidden=true;
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;});
  addEventListener('appinstalled',()=>{button.hidden=true;prompt=null;});
  button.onclick=async()=>{if(prompt){await prompt.prompt();await prompt.userChoice;prompt=null;}else document.getElementById('installHelp').showModal();};
  addEventListener('online',paint);addEventListener('offline',paint);
  if('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'}).then(async reg=>{
      await navigator.serviceWorker.ready;ready=true;paint();
      if(reg.waiting) status.textContent='Доступна новая версия: закройте все окна приложения и откройте снова.';
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)status.textContent='Новая версия готова. Закройте все окна приложения и откройте снова.';});});
    }).catch(()=>{status.textContent='Не удалось сохранить приложение офлайн. Попробуйте перезагрузить страницу с интернетом.';});
  } else status.textContent='Офлайн-режим доступен по HTTPS или на localhost.';
})();
