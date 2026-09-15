(() => {
  const base = new URL('./', document.currentScript.src);
  const button = document.getElementById('installApp');
  let prompt = null;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (installed()) button.hidden = true;
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
  });
  addEventListener('appinstalled', () => {
    button.hidden = true;
    prompt = null;
  });
  button.onclick = async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      prompt = null;
    } else document.getElementById('installHelp').showModal();
  };
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    }).catch(() => {});
  }
})();
