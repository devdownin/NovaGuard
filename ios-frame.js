/* ===========================================================================
   ios-frame.js — iPhone device shell.

   Note: the design imports this as ios-frame.jsx. The repo has no JSX
   toolchain, so this is the same component as a plain factory. Swap it for
   the React version once a build step exists.

   Exposes: window.IOSFrame.mount(root, opts) -> { body, setTime }
   =========================================================================== */
(function (global) {
  'use strict';

  var el = global.Nocturne.el;
  var icon = global.Nocturne.icon;

  /**
   * Renders the device chrome into `root` and returns the scrollable body
   * element for the screen to fill.
   */
  function mount(root, opts) {
    opts = opts || {};

    var time = el('span', { class: 'ios__time', text: global.Support.clockTime() });

    var indicators = el('div', { class: 'ios__indicators' }, [
      el('span', { html: icon('wifi', { size: 16, stroke: 1.9 }) }),
      el('span', { html: icon('battery', { size: 18, stroke: 1.6 }) })
    ]);

    var body = el('div', { class: 'ios__body' });

    var screen = el('div', { class: 'ios__screen' }, [
      el('div', { class: 'ios__island' }),
      el('div', { class: 'ios__statusbar' }, [time, indicators]),
      body,
      opts.footer || null,
      el('div', { class: 'ios__home' })
    ]);

    var frame = el('div', { class: 'ios' }, [
      el('span', { class: 'ios__btn ios__btn--silent' }),
      el('span', { class: 'ios__btn ios__btn--up' }),
      el('span', { class: 'ios__btn ios__btn--down' }),
      el('span', { class: 'ios__btn ios__btn--power' }),
      screen
    ]);

    root.appendChild(frame);

    /* Keep the status bar clock honest. */
    var tick = setInterval(function () {
      time.textContent = global.Support.clockTime();
    }, 20000);

    return {
      body: body,
      screen: screen,
      setTime: function (t) { time.textContent = t; },
      destroy: function () { clearInterval(tick); root.removeChild(frame); }
    };
  }

  global.IOSFrame = { mount: mount };
})(window);
