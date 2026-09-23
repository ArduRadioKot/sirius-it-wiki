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
    updateButton.textContent = updating ? 'Обновляем…' : 'Обновить';
    updateButton.title = online
      ? 'Обновить расписание и приложение'
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

  const abortAfter = (ms) => {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };

  const fetchFresh = (file) =>
    fetch(new URL(file, base), { cache: 'reload', credentials: 'same-origin', signal: abortAfter(12000) });

  const parseVersionFromSw = async () => {
    try {
      const res = await fetchFresh('sw.js');
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

  const activateWaiting = (worker) => {
    if (!worker) return;
    const kick = () => {
      if (worker.state === 'installed' || worker.state === 'waiting') {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    };
    kick();
    worker.addEventListener('statechange', kick);
  };

  const trackRegistration = (reg) => {
    if (!reg) return;
    activateWaiting(reg.installing);
    activateWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => activateWaiting(reg.installing));
  };

  let lastUpdateCheck = 0;
  const checkForUpdates = async () => {
    if (!navigator.onLine || !('serviceWorker' in navigator)) return;
    // Focus and visibility events fire in bursts; one check a minute is plenty.
    if (Date.now() - lastUpdateCheck < 60000) return;
    lastUpdateCheck = Date.now();
    try {
      const reg = await navigator.serviceWorker.getRegistration(base.href);
      if (!reg) return;
      await reg.update();
      trackRegistration(reg);
    } catch {}
  };

  const hardReload = () => {
    try { sessionStorage.setItem('sirius-updated', '1'); } catch {}
    const next = new URL(location.href);
    next.searchParams.set('updated', String(Date.now()));
    location.replace(next.href);
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
    setUpdateStatus('Обновляем расписание и приложение…');

    try {
      try { sessionStorage.setItem('sirius-updated', '1'); } catch {}

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.unregister();
      }
      await clearAppCaches();

      if (typeof window.SiriusSchedule?.refresh === 'function') {
        await window.SiriusSchedule.refresh({ force: true });
      }

      const probe = await fetchFresh('sw.js');
      if (!probe.ok) throw new Error('network');
      const text = await probe.text();
      const match = text.match(/const CACHE = PREFIX \+ '([^']+)'/);
      const nextVersion = match?.[1] || '';
      if (nextVersion) rememberVersion(nextVersion);

      await Promise.allSettled(
        ['index.html', 'pwa.js', 'app.js', 'schedule.js', 'schedule-source.js', 'styles.css', 'theme.js', 'data/schedule.json'].map(
          (file) => fetchFresh(file),
        ),
      );

      setUpdateStatus('Кэш очищен, загружаем новую версию…');
      hardReload();
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
    checkForUpdates();
  });
  addEventListener('offline', syncUpdateButton);
  addEventListener('focus', () => checkForUpdates());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdates();
  });

  showVersion(savedVersion() || '…');
  syncUpdateButton();
  refreshVersionLabel();

  const isLocalHost = () => {
    const hostname = location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
      hostname === '::1' || hostname === '[::1]' || hostname.endsWith('.local') ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  };

  if ('serviceWorker' in navigator && window.isSecureContext) {
    if (isLocalHost()) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      }).catch(() => {});
      clearAppCaches().catch(() => {});
    } else {
      let skipReload = false;
      try {
        skipReload = sessionStorage.getItem('sirius-updated') === '1';
        if (skipReload) sessionStorage.removeItem('sirius-updated');
      } catch {}
      // Only a worker replacing an older one should reload the page; the very first
      // install taking control must not interrupt the first launch.
      const hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker
        .register(new URL('sw.js', base), {
          scope: base.pathname,
          updateViaCache: 'none',
        })
        .then((reg) => {
          if (!reg) return;
          trackRegistration(reg);
          refreshVersionLabel();
          return reg.update().then(() => trackRegistration(reg));
        })
        .catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || skipReload || updating) return;
        skipReload = true;
        hardReload();
      });
      setInterval(checkForUpdates, 5 * 60 * 1000);
    }
  }
})();
