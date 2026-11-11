(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = 'button, input, select, textarea, label, summary, iframe, [contenteditable], [role="slider"], dialog, #lab, .quiz-block, .matan-content .card';
  const easeOut = 'cubic-bezier(0.22, 1, 0.36, 1)';

  function hasHorizontalScroll(target, root) {
    for (let element = target; element && element !== root; element = element.parentElement) {
      if (element.scrollWidth > element.clientWidth + 1 &&
          /^(auto|scroll)$/.test(getComputedStyle(element).overflowX)) return true;
    }
    return false;
  }

  function setRoutes(panel, previous, next, keepScroll = false) {
    panel.dataset.swipeNav = '';
    panel.dataset.swipePrevious = previous || '';
    panel.dataset.swipeNext = next || '';
    if (keepScroll) panel.dataset.swipeKeepScroll = '';
  }

  function bind(root, resolveFallback) {
    let drag = null;
    let leaving = false;
    let pendingRoute = null;
    let animation = null;

    function stopAnimation() {
      animation?.cancel();
      animation = null;
    }

    function animate(panel, frames, duration, easing = easeOut) {
      if (!panel || reducedMotion.matches || !panel.animate) return Promise.resolve();
      stopAnimation();
      const effect = panel.animate(frames, { duration, easing });
      animation = effect;
      return effect.finished.catch(() => {}).finally(() => {
        if (animation === effect) animation = null;
      });
    }

    function showIncoming(panel, step) {
      animate(panel, [
        { translate: `${step * 42}px`, opacity: 0.55 },
        { translate: '0px', opacity: 1 },
      ], 290);
    }

    function localAction(target) {
      const panel = target.closest('[data-swipe-nav]');
      if (!panel) return null;
      return {
        panel,
        destination: step => ({
          hash: step > 0 ? panel.dataset.swipeNext : panel.dataset.swipePrevious,
          selector: '[data-swipe-nav]',
          keepScroll: panel.hasAttribute('data-swipe-keep-scroll'),
        }),
      };
    }

    function resetDrag(settle = true) {
      if (!drag) return;
      const { panel, offset } = drag;
      drag = null;
      panel.style.removeProperty('translate');
      if (settle && offset && panel.isConnected) {
        animate(panel, [{ translate: `${offset}px` }, { translate: '0px' }], 190);
      }
    }

    root.addEventListener('touchstart', event => {
      resetDrag();
      if (leaving || pendingRoute || event.touches.length !== 1) return;
      const target = event.target;
      const touch = event.touches[0];
      // Leave the screen edges free for browser back and forward gestures.
      if (touch.clientX < 24 || touch.clientX > innerWidth - 24) return;
      if (target.closest(controls) && !target.closest('.schedule-week-day')) return;
      if (getSelection()?.isCollapsed === false || hasHorizontalScroll(target, root)) return;
      const action = localAction(target) || resolveFallback(target);
      if (!action) return;
      drag = { ...action, id: touch.identifier, x: touch.clientX, y: touch.clientY,
        hash: location.hash, horizontal: false, offset: 0 };
    }, { passive: true });

    root.addEventListener('touchmove', event => {
      if (!drag) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch.identifier !== drag.id ||
          !drag.panel.isConnected || drag.hash !== location.hash) {
        resetDrag();
        return;
      }
      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (!drag.horizontal) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          resetDrag(false);
          return;
        }
        if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
        drag.horizontal = true;
        stopAnimation();
      }
      if (!event.cancelable) {
        resetDrag();
        return;
      }
      event.preventDefault();
      if (!reducedMotion.matches) {
        drag.offset = Math.max(-104, Math.min(104, dx * 0.72));
        drag.panel.style.translate = `${drag.offset}px`;
      }
    }, { passive: false });

    root.addEventListener('touchend', async event => {
      if (!drag) return;
      const touch = Array.from(event.changedTouches).find(point => point.identifier === drag.id);
      const dx = touch ? touch.clientX - drag.x : 0;
      const dy = touch ? touch.clientY - drag.y : 0;
      if (drag.horizontal && event.cancelable) event.preventDefault();
      const minimum = Math.min(86, Math.max(46, innerWidth * 0.14));
      const step = dx < 0 ? 1 : -1;
      const destination = drag.horizontal && !event.touches.length && Math.abs(dx) >= minimum &&
        Math.abs(dx) > Math.abs(dy) * 1.4 ? drag.destination(step) : null;
      if (!destination || (!destination.hash && !destination.commit)) {
        resetDrag();
        return;
      }

      const { panel, offset, hash } = drag;
      const scrollTop = window.scrollY;
      resetDrag(false);
      leaving = true;
      try {
        await animate(panel, [
          { translate: `${offset}px`, opacity: 1 },
          { translate: `${-step * (Math.abs(offset) + 32)}px`, opacity: 0.4 },
        ], 145, 'ease-in');
        if (location.hash !== hash || !panel.isConnected) return;
        if (destination.hash) {
          pendingRoute = { ...destination, step, scrollTop };
          location.hash = destination.hash;
        } else {
          destination.commit();
          showIncoming(root.querySelector(destination.selector), step);
        }
      } finally {
        leaving = false;
      }
    }, { passive: false });

    root.addEventListener('touchcancel', () => resetDrag(), { passive: true });

    return {
      finishRoute(hash) {
        resetDrag(false);
        const transition = pendingRoute;
        pendingRoute = null;
        if (!transition || transition.hash !== hash) {
          stopAnimation();
          return false;
        }
        const panel = transition.selector ? root.querySelector(transition.selector) : root;
        window.scrollTo({ top: transition.keepScroll ? transition.scrollTop : 0, behavior: 'instant' });
        showIncoming(panel, transition.step);
        return true;
      },
    };
  }

  window.SiriusSwipe = { bind, setRoutes };
})();
