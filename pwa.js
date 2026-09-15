(() => {
  const base = new URL('./', document.currentScript.src);
  const button = document.getElementById('installApp');
  const updateButton = document.getElementById('updateApp');
  const versionEl = document.getElementById('appVersion');
  const updateStatus = document.getElementById('updateStatus');
  const VERSION_KEY = 'sirius-app-version';
  let prompt = null;
  let updating = false;

  const installed = () =>
    matchMedia('(display-mode: standalone)').matches || navigator.standalone;

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

  const savedVersion = () => {
    try {
      return localStorage.getItem(VERSION_KEY) || '';
    } catch {
      return '';
    }
  };

  const rememberVersion = (version) => {
    if (!version) return;
    try {
      localStorage.setItem(VERSION_KEY, version);
    } catch {}
  };

  const showVersion = (version) => {
    if (!versionEl) return;
    versionEl.textContent = version || 'неизвестно';
  };

  const setUpdateStatus = (text, { error = false } = {}) => {
    if (!updateStatus) return;
    updateStatus.hidden = !text;
    updateStatus.textContent = text || '';
    updateStatus.dataset.error = error ? 'true' : 'false';
  };

  const syncUpdateButton = () => {
    if (!updateButton) return;
    const online = navigator.onLine;
    updateButton.disabled = updating || !online;
    updateButton.title = online
      ? 'Скачать актуальную версию и очистить старый кэш'
      : 'Обновление доступно только онлайн';
    if (!online && !updating) {
      setUpdateStatus('Офлайн — используется уже загруженная версия');
    } else if (!updating && online) {
      setUpdateStatus('');
    }
  };

  const askWorkerVersion = (worker) =>
    new Promise((resolve) => {
      if (!worker) return resolve('');
      const onMessage = (event) => {
        if (event.data?.type === 'VERSION' && event.data.version) {
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve(String(event.data.version));
        }
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'GET_VERSION' });
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve('');
      }, 1500);
    });

  const parseVersionFromSw = async () => {
    try {
      const res = await fetch(new URL('sw.js', base), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return '';
      const text = await res.text();
      const match = text.match(/const CACHE = PREFIX \+ '([^']+)'/);
      return match?.[1] || '';
    } catch {
      return '';
    }
  };

  const refreshVersionLabel = async () => {
    let version = '';
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration(base.href);
      version =
        (await askWorkerVersion(reg?.active)) ||
        (await askWorkerVersion(navigator.serviceWorker.controller));
    }
    if (!version && navigator.onLine) version = await parseVersionFromSw();
    if (!version) version = savedVersion();
    if (version) rememberVersion(version);
    showVersion(version);
    return version;
  };

  const clearAppCaches = async () => {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('sirius-wiki-'))
        .map((key) => caches.delete(key)),
    );
  };

  const forceUpdate = async () => {
    if (updating) return;
    if (!navigator.onLine) {
      syncUpdateButton();
      setUpdateStatus('Нужен интернет, чтобы обновить приложение', {
        error: true,
      });
      return;
    }

    updating = true;
    syncUpdateButton();
    setUpdateStatus('Проверяем сеть и обновляем…');

    try {
      const probe = await fetch(new URL(`sw.js?t=${Date.now()}`, base), {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!probe.ok) throw new Error('network');
      const text = await probe.text();
      const match = text.match(/const CACHE = PREFIX \+ '([^']+)'/);
      const nextVersion = match?.[1] || '';
      if (nextVersion) rememberVersion(nextVersion);

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
      await clearAppCaches();

      setUpdateStatus('Кэш очищен, загружаем новую версию…');
      location.reload();
    } catch {
      updating = false;
      syncUpdateButton();
      setUpdateStatus(
        'Не удалось обновить. Осталась уже загруженная версия.',
        { error: true },
      );
    }
  };

  if (updateButton) updateButton.onclick = forceUpdate;
  addEventListener('online', () => {
    syncUpdateButton();
    refreshVersionLabel();
  });
  addEventListener('offline', syncUpdateButton);

  showVersion(savedVersion() || '…');
  syncUpdateButton();
  refreshVersionLabel();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker
      .register(new URL('sw.js', base), {
        scope: base.pathname,
        updateViaCache: 'none',
      })
      .then(() => refreshVersionLabel())
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      refreshVersionLabel();
    });
  }
})();
