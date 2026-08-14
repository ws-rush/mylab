/**
 * Variant A: Editor Stack Accordion Pane
 * Integrates the console directly as the 4th collapsible pane in the right-hand editor stack.
 */
import { logStore } from './console-engine.js';
import { renderLogEntryHtml } from './render-helpers.js';

export class VariantA {
  constructor(container) {
    this.name = 'A — Editor Stack Accordion Pane';
    this.container = container;
    this.unsubscribe = null;
    this.sectionEl = null;
    this.splitterEl = null;
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
    if (this.splitterEl) this.splitterEl.remove();
    if (this.sectionEl) this.sectionEl.remove();
    window.mylab?.layoutEditorPanes?.();
  }

  renderSkeleton() {
    const editorStack = document.querySelector('#editor-stack');
    if (!editorStack) return;

    // Create splitter
    this.splitterEl = document.createElement('div');
    this.splitterEl.className = 'editor-splitter prototype-var-a-splitter';
    this.splitterEl.setAttribute('role', 'separator');
    this.splitterEl.setAttribute('aria-label', 'Resize JavaScript and Console panes');
    this.splitterEl.setAttribute('aria-orientation', 'horizontal');
    this.splitterEl.setAttribute('aria-valuemin', '30');
    this.splitterEl.setAttribute('aria-valuemax', '1000');
    this.splitterEl.setAttribute('aria-valuenow', '50');
    this.splitterEl.setAttribute('tabindex', '0');

    // Create section
    this.sectionEl = document.createElement('section');
    this.sectionEl.className = 'editor-section is-open prototype-section-console';
    this.sectionEl.setAttribute('data-editor', 'console');
    this.sectionEl.id = 'editor-console-section';

    this.sectionEl.innerHTML = `
      <button class="section-header console-header" type="button" aria-expanded="true" aria-controls="editor-console">
        <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4"></path>
        </svg>
        <span class="header-title">Console</span>
        <div class="header-badges">
          <span class="badge badge-error is-hidden" id="var-a-badge-error">0</span>
          <span class="badge badge-warn is-hidden" id="var-a-badge-warn">0</span>
          <span class="badge badge-log" id="var-a-badge-log">0</span>
        </div>
        <div class="header-quick-actions">
          <button class="icon-action-btn" id="var-a-quick-clear" type="button" title="Clear console" aria-label="Clear console">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
      </button>
      <div class="editor-container console-container" id="editor-console">
        <div class="console-toolbar">
          <div class="filter-pills" role="tablist">
            <button class="filter-pill is-active" data-filter="all" type="button">All <span class="pill-count" id="var-a-count-all">0</span></button>
            <button class="filter-pill" data-filter="log" type="button">Logs <span class="pill-count" id="var-a-count-logs">0</span></button>
            <button class="filter-pill" data-filter="warn" type="button">Warn <span class="pill-count" id="var-a-count-warns">0</span></button>
            <button class="filter-pill" data-filter="error" type="button">Errors <span class="pill-count" id="var-a-count-errors">0</span></button>
          </div>
          <div class="search-wrap">
            <input type="text" class="console-search" id="var-a-search" placeholder="Filter logs..." aria-label="Filter console messages" />
          </div>
          <div class="toolbar-toggles">
            <label class="toggle-label" title="Clear console when preview refreshes">
              <input type="checkbox" id="var-a-autoclear" ${logStore.autoClearOnRun ? 'checked' : ''} />
              <span>Auto-clear</span>
            </label>
            <button class="text-action-btn" id="var-a-clear-btn" type="button">Clear</button>
          </div>
        </div>
        <div class="console-log-stream" id="var-a-log-stream" role="log" aria-live="polite">
          <div class="console-empty-state">No console output yet. Write JavaScript or use simulate tools.</div>
        </div>
      </div>
    `;

    editorStack.appendChild(this.splitterEl);
    editorStack.appendChild(this.sectionEl);

    // Register section and splitter with main app lifecycle
    window.mylab?.setupSections?.();
    window.mylab?.setupEditorSplitter?.(this.splitterEl);
    window.mylab?.layoutEditorPanes?.();
  }

  bindEvents() {
    if (!this.sectionEl) return;

    // Filter pills
    const pills = this.sectionEl.querySelectorAll('.filter-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        logStore.filter = pill.dataset.filter;
        this.updateStream();
      });
    });

    // Search input
    const search = this.sectionEl.querySelector('#var-a-search');
    search?.addEventListener('input', (e) => {
      logStore.searchQuery = e.target.value;
      this.updateStream();
    });

    // Auto-clear
    const autoClear = this.sectionEl.querySelector('#var-a-autoclear');
    autoClear?.addEventListener('change', (e) => {
      logStore.autoClearOnRun = e.target.checked;
    });

    // Clear buttons
    this.sectionEl.querySelector('#var-a-clear-btn')?.addEventListener('click', () => logStore.clear());
    this.sectionEl.querySelector('#var-a-quick-clear')?.addEventListener('click', (e) => {
      e.stopPropagation();
      logStore.clear();
    });
  }

  update() {
    if (!this.sectionEl) return;

    const counts = logStore.getCounts();

    // Badges in header
    const errBadge = this.sectionEl.querySelector('#var-a-badge-error');
    const warnBadge = this.sectionEl.querySelector('#var-a-badge-warn');
    const logBadge = this.sectionEl.querySelector('#var-a-badge-log');

    if (errBadge) {
      errBadge.textContent = counts.errors;
      errBadge.classList.toggle('is-hidden', counts.errors === 0);
    }
    if (warnBadge) {
      warnBadge.textContent = counts.warnings;
      warnBadge.classList.toggle('is-hidden', counts.warnings === 0);
    }
    if (logBadge) {
      logBadge.textContent = counts.logs;
      logBadge.classList.toggle('is-hidden', counts.logs === 0 && counts.errors > 0);
    }

    // Counts in filter pills
    const countAll = this.sectionEl.querySelector('#var-a-count-all');
    const countLogs = this.sectionEl.querySelector('#var-a-count-logs');
    const countWarns = this.sectionEl.querySelector('#var-a-count-warns');
    const countErrors = this.sectionEl.querySelector('#var-a-count-errors');

    if (countAll) countAll.textContent = counts.total;
    if (countLogs) countLogs.textContent = counts.logs;
    if (countWarns) countWarns.textContent = counts.warnings;
    if (countErrors) countErrors.textContent = counts.errors;

    this.updateStream();
  }

  updateStream() {
    const stream = this.sectionEl?.querySelector('#var-a-log-stream');
    if (!stream) return;

    const entries = logStore.getFilteredEntries();
    if (entries.length === 0) {
      stream.innerHTML = `<div class="console-empty-state">No matching console messages.</div>`;
      return;
    }

    stream.innerHTML = entries.map(renderLogEntryHtml).join('');
    // Auto-scroll to bottom
    stream.scrollTop = stream.scrollHeight;
  }
}
