/**
 * Variant C: Preview Floating HUD & Overlay Drawer
 * Anchored to the Preview Pane — zero editor real estate consumed, with floating HUD badge,
 * error alert banner, and glassmorphic slide-up overlay drawer.
 */
import { logStore } from './console-engine.js';
import { renderLogEntryHtml } from './render-helpers.js';

export class VariantC {
  constructor(container) {
    this.name = 'C — Preview Floating HUD & Overlay';
    this.container = container || document.querySelector('#preview-pane');
    this.unsubscribe = null;
    this.overlayEl = null;
    this.hudPillEl = null;
    this.bannerEl = null;
    this.isOpen = false;
  }

  mount() {
    this.renderSkeleton();
    this.bindEvents();
    this.unsubscribe = logStore.subscribe(() => this.update());
    this.update();
  }

  unmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.hudPillEl) this.hudPillEl.remove();
    if (this.bannerEl) this.bannerEl.remove();
    if (this.overlayEl) this.overlayEl.remove();
  }

  renderSkeleton() {
    const previewPane = document.querySelector('#preview-pane');
    if (!previewPane) return;

    // 1. Floating HUD Pill at bottom-left of preview pane
    this.hudPillEl = document.createElement('div');
    this.hudPillEl.className = 'prototype-preview-hud';
    this.hudPillEl.id = 'prototype-preview-hud';
    this.hudPillEl.innerHTML = `
      <button class="hud-pill-button" id="var-c-hud-btn" type="button" aria-expanded="false" title="Toggle preview console drawer">
        <span class="hud-status-dot" id="var-c-hud-dot"></span>
        <span class="hud-label">Console</span>
        <span class="hud-badge" id="var-c-hud-badge">0</span>
      </button>
    `;

    // 2. Fatal Error Alert Banner (at top of preview pane)
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'prototype-fatal-banner is-hidden';
    this.bannerEl.id = 'prototype-fatal-banner';
    this.bannerEl.innerHTML = `
      <div class="banner-inner">
        <div class="banner-icon">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1Zm0 10.5a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm.9-3.7H7.1l-.3-4.3h2.4Z"/>
          </svg>
        </div>
        <div class="banner-text">
          <div class="banner-title" id="var-c-banner-title">Script Error Detected</div>
          <div class="banner-msg" id="var-c-banner-msg">Syntax or runtime error prevented complete rendering</div>
        </div>
        <div class="banner-actions">
          <button class="banner-action-btn" id="var-c-banner-inspect" type="button">Inspect</button>
          <button class="banner-close-btn" id="var-c-banner-close" type="button" title="Dismiss banner">✕</button>
        </div>
      </div>
    `;

    // 3. Glassmorphic Slide-up Drawer over preview pane
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'prototype-preview-drawer is-closed';
    this.overlayEl.id = 'prototype-preview-drawer';
    this.overlayEl.innerHTML = `
      <div class="drawer-glass-panel">
        <header class="drawer-header">
          <div class="drawer-title-group">
            <span class="drawer-dot" id="var-c-drawer-dot"></span>
            <span class="drawer-title">Live Preview Console</span>
            <span class="drawer-count-badge" id="var-c-drawer-count">0 items</span>
          </div>

          <div class="drawer-filters">
            <button class="drawer-filter-btn is-active" data-filter="all" type="button">All</button>
            <button class="drawer-filter-btn" data-filter="log" type="button">Logs</button>
            <button class="drawer-filter-btn" data-filter="warn" type="button">Warns</button>
            <button class="drawer-filter-btn" data-filter="error" type="button">Errors</button>
          </div>

          <div class="drawer-tools">
            <input type="text" class="drawer-search" id="var-c-search" placeholder="Search logs..." />
            <button class="drawer-icon-btn" id="var-c-clear" type="button" title="Clear logs">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
                <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </button>
            <button class="drawer-icon-btn" id="var-c-close-btn" type="button" title="Close drawer">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="drawer-body" id="var-c-stream" role="log">
          <div class="drawer-empty">No console activity in preview.</div>
        </div>
      </div>
    `;

    previewPane.appendChild(this.hudPillEl);
    previewPane.appendChild(this.bannerEl);
    previewPane.appendChild(this.overlayEl);
  }

  bindEvents() {
    if (!this.overlayEl) return;

    const toggleBtn = this.hudPillEl?.querySelector('#var-c-hud-btn');
    const closeBtn = this.overlayEl.querySelector('#var-c-close-btn');

    const toggleOpen = () => {
      this.isOpen = !this.isOpen;
      this.overlayEl.classList.toggle('is-closed', !this.isOpen);
      this.overlayEl.classList.toggle('is-open', this.isOpen);
      toggleBtn?.setAttribute('aria-expanded', String(this.isOpen));
      if (this.isOpen) {
        this.updateStream();
      }
    };

    toggleBtn?.addEventListener('click', toggleOpen);
    closeBtn?.addEventListener('click', toggleOpen);

    // Banner actions
    this.bannerEl?.querySelector('#var-c-banner-inspect')?.addEventListener('click', () => {
      if (!this.isOpen) toggleOpen();
      logStore.filter = 'error';
      const errorFilterBtn = this.overlayEl.querySelector('.drawer-filter-btn[data-filter="error"]');
      if (errorFilterBtn) {
        this.overlayEl.querySelectorAll('.drawer-filter-btn').forEach((b) => b.classList.remove('is-active'));
        errorFilterBtn.classList.add('is-active');
      }
      this.updateStream();
    });

    this.bannerEl?.querySelector('#var-c-banner-close')?.addEventListener('click', () => {
      this.bannerEl.classList.add('is-hidden');
      logStore.clearFatalError();
    });

    // Filter buttons
    const filterBtns = this.overlayEl.querySelectorAll('.drawer-filter-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        logStore.filter = btn.dataset.filter;
        this.updateStream();
      });
    });

    // Search
    const search = this.overlayEl.querySelector('#var-c-search');
    search?.addEventListener('input', (e) => {
      logStore.searchQuery = e.target.value;
      this.updateStream();
    });

    // Clear
    this.overlayEl.querySelector('#var-c-clear')?.addEventListener('click', () => logStore.clear());
  }

  update() {
    if (!this.overlayEl || !this.hudPillEl) return;

    const counts = logStore.getCounts();

    // HUD Pill updates
    const hudDot = this.hudPillEl.querySelector('#var-c-hud-dot');
    const hudBadge = this.hudPillEl.querySelector('#var-c-hud-badge');
    const hudBtn = this.hudPillEl.querySelector('#var-c-hud-btn');

    if (hudDot) {
      hudDot.className = 'hud-status-dot ' + (counts.errors > 0 ? 'is-error' : counts.warnings > 0 ? 'is-warn' : 'is-ok');
    }

    if (hudBadge) {
      hudBadge.textContent = counts.errors > 0 ? `${counts.errors} err` : `${counts.total}`;
      hudBadge.className = 'hud-badge ' + (counts.errors > 0 ? 'badge-err' : counts.warnings > 0 ? 'badge-warn' : 'badge-log');
    }

    if (hudBtn) {
      if (counts.errors > 0) {
        hudBtn.classList.add('has-errors');
      } else {
        hudBtn.classList.remove('has-errors');
      }
    }

    // Fatal Error Banner
    if (this.bannerEl) {
      if (logStore.fatalError) {
        const err = logStore.fatalError;
        this.bannerEl.classList.remove('is-hidden');
        const title = this.bannerEl.querySelector('#var-c-banner-title');
        const msg = this.bannerEl.querySelector('#var-c-banner-msg');
        if (title) title.textContent = err.category === 'syntax' ? 'SyntaxError: Parsing Failed' : 'Fatal Runtime Exception';
        if (msg) msg.textContent = `${err.message || 'Error executing script'} (line ${err.lineno || 1}:${err.colno || 1})`;
      } else if (counts.errors === 0) {
        this.bannerEl.classList.add('is-hidden');
      }
    }

    // Drawer header updates
    const drawerDot = this.overlayEl.querySelector('#var-c-drawer-dot');
    const drawerCount = this.overlayEl.querySelector('#var-c-drawer-count');

    if (drawerDot) {
      drawerDot.className = 'drawer-dot ' + (counts.errors > 0 ? 'is-error' : counts.warnings > 0 ? 'is-warn' : 'is-ok');
    }

    if (drawerCount) {
      drawerCount.textContent = `${counts.total} items (${counts.errors} errors, ${counts.warnings} warns)`;
    }

    this.updateStream();
  }

  updateStream() {
    const stream = this.overlayEl?.querySelector('#var-c-stream');
    if (!stream) return;

    const entries = logStore.getFilteredEntries();
    if (entries.length === 0) {
      stream.innerHTML = `<div class="drawer-empty">No console activity in preview.</div>`;
      return;
    }

    stream.innerHTML = entries.map(renderLogEntryHtml).join('');
    stream.scrollTop = stream.scrollHeight;
  }
}
