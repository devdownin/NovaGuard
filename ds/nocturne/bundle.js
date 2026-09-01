/* ===========================================================================
   nocturne — design system bundle (defaults)
   Mirrors the shape of _ds/nocturne-<id>/_ds_bundle.js so the real bundle
   from Claude Design can replace this file directly.
   Exposes: window.Nocturne { tokens, icon, el }
   =========================================================================== */
(function (global) {
  'use strict';

  var tokens = {
    color: {
      bg: '#070910',
      surface: '#0F1420',
      surface2: '#161D2C',
      surface3: '#1E2739',
      border: '#232D42',
      text: '#E9EDF6',
      text2: '#97A3BC',
      text3: '#5D6980',
      accent: '#5B8CFF',
      armed: '#3DDC97',
      warn: '#FFB84D',
      danger: '#FF5C7A'
    },
    radius: { sm: 8, md: 14, lg: 20, xl: 28 },
    space: 4
  };

  /* 24x24 stroke icons, drawn to match SF Symbols' weight. */
  var PATHS = {
    shield:   '<path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6l7-3z"/>',
    check:    '<path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6l7-3z"/><path d="M9 11.8l2.1 2.1L15.2 9.8"/>',
    bolt:     '<path d="M13 3L5.5 13H11l-1 8 7.5-10H12l1-8z"/>',
    door:     '<path d="M5 20h14"/><path d="M8 20V4.8a.8.8 0 01.9-.8l6 .9a.8.8 0 01.7.8V20"/><circle cx="13" cy="12.5" r=".9" fill="currentColor" stroke="none"/>',
    motion:   '<circle cx="12" cy="5.2" r="1.9"/><path d="M12 9v5m0 0l-2.6 5M12 14l2.6 5"/><path d="M8 10.8l4-1.4 4 1.4"/>',
    window:   '<rect x="4" y="4" width="16" height="16" rx="1.6"/><path d="M12 4v16M4 12h16"/>',
    smoke:    '<path d="M7.5 17.5a4 4 0 01-.4-8A5.2 5.2 0 0117 8.8a3.4 3.4 0 01-.4 8.7z"/><path d="M9 20.5h6"/>',
    camera:   '<rect x="3" y="6.5" width="12.5" height="11" rx="2.2"/><path d="M15.5 11l5-2.8v7.6l-5-2.8z"/>',
    bell:     '<path d="M18 15.5V11a6 6 0 10-12 0v4.5L4.5 18h15L18 15.5z"/><path d="M10 20.5a2.2 2.2 0 004 0"/>',
    clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.4V12l3 1.8"/>',
    gear:     '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.4a1.5 1.5 0 00.3 1.7l.1.1a1.9 1.9 0 11-2.7 2.7l-.1-.1a1.5 1.5 0 00-2.6 1.1v.2a1.9 1.9 0 11-3.8 0v-.1a1.5 1.5 0 00-2.6-1.1l-.1.1A1.9 1.9 0 114.2 16l.1-.1a1.5 1.5 0 00-1.1-2.6h-.2a1.9 1.9 0 110-3.8h.1a1.5 1.5 0 001.1-2.6l-.1-.1A1.9 1.9 0 118 4.2l.1.1a1.5 1.5 0 001.7.3 1.5 1.5 0 00.9-1.4v-.2a1.9 1.9 0 113.8 0v.1a1.5 1.5 0 002.6 1.1l.1-.1A1.9 1.9 0 1119.8 8l-.1.1a1.5 1.5 0 001.1 2.6h.2a1.9 1.9 0 110 3.8h-.1a1.5 1.5 0 00-1.4.9z"/>',
    home:     '<path d="M4 10.5L12 4l8 6.5"/><path d="M6 9.6V20h12V9.6"/>',
    away:     '<path d="M3.5 20h17"/><path d="M6 20V9l6-4.5L18 9v11"/><path d="M10 20v-4.5h4V20"/>',
    off:      '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 8.6l6.8 6.8"/>',
    battery:  '<rect x="2.5" y="8" width="16" height="8" rx="2.2"/><path d="M21 11v2"/>',
    wifi:     '<path d="M2.5 9.2a14 14 0 0119 0"/><path d="M6 12.6a9 9 0 0112 0"/><path d="M9.3 16a4.4 4.4 0 015.4 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none"/>',
    chevron:  '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
    plus:     '<path d="M12 5.5v13M5.5 12h13"/>'
  };

  /**
   * icon(name, opts) -> SVG markup string.
   * opts.size (px, default 20), opts.stroke (px, default 1.7)
   */
  function icon(name, opts) {
    opts = opts || {};
    var d = PATHS[name] || PATHS.shield;
    var size = opts.size || 20;
    return '<svg class="n-icon" viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="' + (opts.stroke || 1.7) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /**
   * el(tag, attrs, children) -> HTMLElement.
   * attrs.html sets innerHTML; attrs.text sets textContent; on* keys bind listeners.
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  global.Nocturne = { tokens: tokens, icon: icon, el: el, iconNames: Object.keys(PATHS) };
})(window);
