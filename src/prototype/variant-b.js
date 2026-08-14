/**
 * Variant B: Docked Bottom DevTools Panel
 * A full-width bottom drawer docked beneath the workspace with status bar and multi-column DevTools layout.
 */
import { logStore } from './console-engine.js';
import { renderLogEntryHtml } from './render-helpers.js';

export class VariantB {
  constructor(container) {
    this.name = 'B — Docked Bottom DevTools Panel';
    this.container = container || document.body;
    this.unsubscribe = null;
    this.dockEl = null;
    this.isOpen = true;
    this.height = 240;
    this.activeTab = 'console'; // console, issues, tables
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
    if (this.dockEl) this.dockEl.remove();
    document.body.classList.remove('has-bottom-dock');
  }

  renderSkeleton() {
    document.body.classList.add('has-bottom-dock');

    this.dockEl = document.createElement('div');
    this.dockEl.className = 'prototype-bottom-dock is-open';
    this.dockEl.id = 'prototype-bottom-dock';

    this.dockEl.innerHTML = `
      <!-- Top Resize Handle -->
      <div class="dock-resize-handle" id="var-b-resize-handle" title="Drag to resize console drawer">
        <div class="resize-handle-bar"></div>
      </div>

      <!-- Drawer Content -->
      <div class="dock-drawer" id="var-b-drawer" style="height: ${this.height}px;">
        <header class="dock-header">
          <div class="dock-tabs" role="tablist">
            <button class="dock-tab is-active" data-tab="console" type="button">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM3.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-9Z"/><path d="m5 5.5 2.5 2.5L5 10.5h1.5L9 8 6.5 5.5H5Zm4 4.5h2v1H9v-1Z"/></svg>
              <span>Console</span>
              <span class="dock-pill" id="var-b-tab-count-console">0</span>
            </button>
            <button class="dock-tab" data-tab="issues" type="button">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 1a7 7 0 1 0 7 7A7 7 0 0 0 8 1Zm0 10.5a1 1 0 1 1 1-1 1 1 0 0 1-1 1Zm.9-3.7H7.1l-.3-4.3h2.4Z"/></svg>
              <span>Issues & Errors</span>
              <span class="dock-pill badge-error is-hidden" id="var-b-tab-count-issues">0</span>
            </button>
          </div>

          <div class="dock-controls">
            <div class="filter-group">
              <button class="level-btn is-active" data-level="all" type="button">All</button>
              <button class="level-btn" data-level="log" type="button">Logs</button>
              <button class="level-btn" data-level="warn" type="button">Warnings</button>
              <button class="level-btn" data-level="error" type="button">Errors</button>
            </div>
            <input type="text" class="dock-search" id="var-b-search" placeholder="Filter output..." aria-label="Filter output" />
            <button class="dock-action-btn" id="var-b-clear" type="button" title="Clear console">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>
              <span>Clear</span>
            </button>
            <button class="dock-action-btn" id="var-b-close" type="button" title="Minimize drawer">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="m4 6 4 4 4-4"/></svg>
            </button>
          </div>
        </header>

        <div class="dock-body" id="var-b-body">
          <div class="dock-table-header">
            <div class="col-icon">#</div>
            <div class="col-time">Time</div>
            <div class="col-msg">Message / Object</div>
          </div>
          <div class="dock-stream" id="var-b-stream" role="log">
            <div class="dock-empty">Console is ready. Output from preview scripts will appear here.</div>
          </div>
        </div>
      </div>

      <!-- Persistent Bottom Status Bar -->
      <footer class="dock-statusbar">
        <div class="status-left">
          <button class="status-btn" id="var-b-toggle-btn" type="button" aria-expanded="true">
            <span class="status-dot is-idle" id="var-b-status-dot"></span>
            <span class="status-title">Console</span>
            <span class="status-badge" id="var-b-status-badge">0 logs</span>
          </button>
          <div class="status-divider"></div>
          <span class="status-indicator" id="var-b-runtime-indicator">🟢 Live Execution</span>
        </div>
        <div class="status-right">
          <label class="status-toggle">
            <input type="checkbox" id="var-b-autoclear" ${logStore.autoClearOnRun ? 'checked' : ''} />
            <span>Preserve Log on Run: Off</span>
          </label>
        </div>
      </footer>
    `;

    document.body.appendChild(this.dockEl);
  }

  bindEvents() {
    if (!this.dockEl) return;

    // Toggle drawer open/closed
    const toggleBtn = this.dockEl.querySelector('#var-b-toggle-btn');
    const closeBtn = this.dockEl.querySelector('#var-b-close');
    const drawer = this.dockEl.querySelector('#var-b-drawer');

    const toggleDrawer = () => {
      this.isOpen = !this.isOpen;
      this.dockEl.classList.toggle('is-open', this.isOpen);
      toggleBtn.setAttribute('aria-expanded', String(this.isOpen));
      if (this.isOpen) {
        drawer.style.height = `${this.height}px`;
      } else {
        drawer.style.height = '0px';
      }
    };

    toggleBtn?.addEventListener('click', toggleDrawer);
    closeBtn?.addEventListener('click', toggleDrawer);

    // Tabs
    const tabs = this.dockEl.querySelectorAll('.dock-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        this.activeTab = tab.dataset.tab;
        if (this.activeTab === 'issues') {
          logStore.filter = 'error';
        } else {
          logStore.filter = 'all';
        }
        this.updateStream();
      });
    });

    // Level buttons
    const levelBtns = this.dockEl.querySelectorAll('.level-btn');
    levelBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        levelBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        logStore.filter = btn.dataset.level;
        this.updateStream();
      });
    });

    // Search input
    const search = this.dockEl.querySelector('#var-b-search');
    search?.addEventListener('input', (e) => {
      logStore.searchQuery = e.target.value;
      this.updateStream();
    });

    // Clear
    this.dockEl.querySelector('#var-b-clear')?.addEventListener('click', () => logStore.clear());

    // Auto-clear
    this.dockEl.querySelector('#var-b-autoclear')?.addEventListener('change', (e) => {
      logStore.autoClearOnRun = !e.target.checked;
      const label = e.target.closest('label')?.querySelector('span');
      if (label) label.textContent = `Preserve Log on Run: ${e.target.checked ? 'On' : 'Off'}`;
    });

    // Top resize handle dragging
    const handle = this.dockEl.querySelector('#var-b-resize-handle');
    let dragging = false;
    let startY = 0;
    let startH = 0;

    handle?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startY = e.clientY;
      startH = this.height;
      handle.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });

    handle?.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const delta = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight - 100, startH + delta));
      this.height = newHeight;
      drawer.style.height = `${newHeight}px`;
    });

    const stopResize = () => {
      if (dragging) {
        dragging = false;
        document.body.style.cursor = '';
      }
    };

    handle?.addEventListener('pointerup', stopResize);
    handle?.addEventListener('pointercancel', stopResize);
  }

  update() {
    if (!this.dockEl) return;

    const counts = logStore.getCounts();

    // Tab counts
    const tabConsole = this.dockEl.querySelector('#var-b-tab-count-console');
    const tabIssues = this.dockEl.querySelector('#var-b-tab-count-issues');

    if (tabConsole) tabConsole.textContent = counts.total;
    if (tabIssues) {
      tabIssues.textContent = counts.errors;
      tabIssues.classList.toggle('is-hidden', counts.errors === 0);
    }

    // Status bar badge & dot
    const statusDot = this.dockEl.querySelector('#var-b-status-dot');
    const statusBadge = this.dockEl.querySelector('#var-b-status-badge');
    const runtimeInd = this.dockEl.querySelector('#var-b-runtime-indicator');

    if (statusDot) {
      statusDot.className = 'status-dot ' + (counts.errors > 0 ? 'is-error' : counts.warnings > 0 ? 'is-warn' : 'is-ok');
    }

    if (statusBadge) {
      if (counts.errors > 0) {
        statusBadge.innerHTML = `<span class="badge-pill badge-pill-err">${counts.errors} ${counts.errors === 1 ? 'error' : 'errors'}</span>`;
      } else if (counts.warnings > 0) {
        statusBadge.innerHTML = `<span class="badge-pill badge-pill-warn">${counts.warnings} warn</span>`;
      } else {
        statusBadge.textContent = `${counts.logs} logs`;
      }
    }

    if (runtimeInd) {
      if (counts.errors > 0) {
        runtimeInd.innerHTML = '🔴 Script Error Detected';
      } else {
        runtimeInd.innerHTML = '🟢 Live Execution';
      }
    }

    this.updateStream();
  }

  updateStream() {
    const stream = this.dockEl?.querySelector('#var-b-stream');
    if (!stream) return;

    const entries = logStore.getFilteredEntries();
    if (entries.length === 0) {
      stream.innerHTML = `<div class="dock-empty">No log entries found.</div>`;
      return;
    }

    stream.innerHTML = entries.map(renderLogEntryHtml).join('');
    stream.scrollTop = stream.scrollHeight;
  }
}
