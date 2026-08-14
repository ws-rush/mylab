/**
 * Floating Prototype Switcher & Interactive Simulation Bar
 */
import { logStore } from './console-engine.js';

export class PrototypeSwitcher {
  constructor({ variants, currentVariant, onSwitch }) {
    this.variants = variants; // [{ key: 'A', name: '...' }, ...]
    this.currentVariant = currentVariant || 'A';
    this.onSwitch = onSwitch;
    this.switcherEl = null;
    this.simMenuOpen = false;
  }

  mount() {
    this.render();
    this.bindEvents();
  }

  render() {
    this.switcherEl = document.createElement('aside');
    this.switcherEl.className = 'prototype-floating-switcher';
    this.switcherEl.setAttribute('aria-label', 'UI Prototype Variant Switcher');

    const currentObj = this.variants.find((v) => v.key === this.currentVariant) || this.variants[0];

    this.switcherEl.innerHTML = `
      <div class="switcher-pill">
        <div class="prototype-tag" title="Throwaway prototype for GitHub Issue #9">
          <span class="proto-dot"></span>
          <span class="proto-text">PROTOTYPE</span>
        </div>

        <div class="switcher-nav">
          <button class="nav-arrow-btn" id="proto-prev-btn" type="button" title="Previous variant (Left arrow)" aria-label="Previous variant">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M11 2 5 8l6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div class="variant-info" id="proto-variant-label" title="Click to view all variants">
            <span class="variant-key">${currentObj.key}</span>
            <span class="variant-title">${currentObj.name}</span>
          </div>

          <button class="nav-arrow-btn" id="proto-next-btn" type="button" title="Next variant (Right arrow)" aria-label="Next variant">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M5 2 11 8l-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="switcher-divider"></div>

        <div class="switcher-actions">
          <button class="sim-trigger-btn" id="proto-sim-btn" type="button" title="Simulate console logs, errors, and tables">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M8 1 2 9h5v6l6-8H8V1Z"/>
            </svg>
            <span>Simulate</span>
          </button>
        </div>
      </div>

      <!-- Simulation Dropdown Menu -->
      <div class="sim-dropdown is-hidden" id="proto-sim-menu">
        <div class="sim-menu-header">Quick Test Events</div>
        <button class="sim-menu-item" data-action="log-obj" type="button">
          <span class="sim-icon">ℹ️</span>
          <span>console.log(string, object)</span>
        </button>
        <button class="sim-menu-item" data-action="log-warn" type="button">
          <span class="sim-icon">⚠️</span>
          <span>console.warn(message)</span>
        </button>
        <button class="sim-menu-item" data-action="log-err" type="button">
          <span class="sim-icon">❌</span>
          <span>console.error(TypeError)</span>
        </button>
        <button class="sim-menu-item" data-action="log-syntax" type="button">
          <span class="sim-icon">🚫</span>
          <span>SyntaxError: Parse failure</span>
        </button>
        <button class="sim-menu-item" data-action="log-table" type="button">
          <span class="sim-icon">📊</span>
          <span>console.table(records)</span>
        </button>
        <button class="sim-menu-item" data-action="log-async" type="button">
          <span class="sim-icon">⚡</span>
          <span>Unhandled Promise Rejection</span>
        </button>
        <div class="sim-menu-divider"></div>
        <button class="sim-menu-item sim-clear" data-action="clear" type="button">
          <span class="sim-icon">🗑️</span>
          <span>Clear Console Logs</span>
        </button>
      </div>
    `;

    document.body.appendChild(this.switcherEl);
  }

  bindEvents() {
    if (!this.switcherEl) return;

    const prevBtn = this.switcherEl.querySelector('#proto-prev-btn');
    const nextBtn = this.switcherEl.querySelector('#proto-next-btn');
    const simBtn = this.switcherEl.querySelector('#proto-sim-btn');
    const simMenu = this.switcherEl.querySelector('#proto-sim-menu');

    const cycle = (step) => {
      const curIndex = this.variants.findIndex((v) => v.key === this.currentVariant);
      const nextIndex = (curIndex + step + this.variants.length) % this.variants.length;
      this.switchVariant(this.variants[nextIndex].key);
    };

    prevBtn?.addEventListener('click', () => cycle(-1));
    nextBtn?.addEventListener('click', () => cycle(1));

    // Simulation menu toggle
    simBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.simMenuOpen = !this.simMenuOpen;
      simMenu?.classList.toggle('is-hidden', !this.simMenuOpen);
    });

    document.addEventListener('click', (e) => {
      if (!this.switcherEl?.contains(e.target)) {
        this.simMenuOpen = false;
        simMenu?.classList.add('is-hidden');
      }
    });

    // Simulation triggers
    simMenu?.querySelectorAll('.sim-menu-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.triggerSimulation(action);
        this.simMenuOpen = false;
        simMenu.classList.add('is-hidden');
      });
    });

    // Global keyboard navigation: ArrowLeft / ArrowRight
    window.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable ||
          active.closest('.cm-editor') ||
          active.closest('.cm-content'))
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cycle(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        cycle(1);
      }
    });
  }

  triggerSimulation(action) {
    switch (action) {
      case 'log-obj':
        logStore.addEntry({
          level: 'log',
          args: [
            { type: 'string', value: 'Render cycle complete', preview: 'Render cycle complete' },
            {
              type: 'object',
              constructorName: 'ComponentState',
              preview: 'ComponentState { active: true, count: 42, theme: "dark" }',
              entries: {
                active: { type: 'boolean', value: true, preview: 'true' },
                count: { type: 'number', value: 42, preview: '42' },
                theme: { type: 'string', value: 'dark', preview: '"dark"' },
                nested: {
                  type: 'object',
                  constructorName: 'Object',
                  preview: '{ fps: 60 }',
                  entries: { fps: { type: 'number', value: 60, preview: '60' } },
                },
              },
            },
          ],
        });
        break;
      case 'log-warn':
        logStore.addEntry({
          level: 'warn',
          args: [
            { type: 'string', value: 'Performance warning: Frame took 32.4ms to render in preview', preview: 'Performance warning: Frame took 32.4ms to render in preview' },
          ],
        });
        break;
      case 'log-err':
        logStore.addEntry({
          level: 'error',
          category: 'runtime',
          message: "TypeError: Cannot read properties of null (reading 'addEventListener')",
          stack: "TypeError: Cannot read properties of null (reading 'addEventListener')\n    at preview.js:4:7\n    at runScript (mylab:120:12)",
        });
        break;
      case 'log-syntax':
        logStore.addEntry({
          level: 'error',
          category: 'syntax',
          isFatal: true,
          message: "Unexpected token '}'",
          filename: 'preview.js',
          lineno: 7,
          colno: 3,
        });
        break;
      case 'log-table':
        logStore.addEntry({
          level: 'table',
          data: {
            type: 'array',
            length: 3,
            items: [
              {
                type: 'object',
                entries: {
                  id: { type: 'number', value: 1, preview: '1' },
                  name: { type: 'string', value: 'Landing Page Hero', preview: '"Landing Page Hero"' },
                  status: { type: 'string', value: 'active', preview: '"active"' },
                  bytes: { type: 'number', value: 1420, preview: '1420' },
                },
              },
              {
                type: 'object',
                entries: {
                  id: { type: 'number', value: 2, preview: '2' },
                  name: { type: 'string', value: 'Dark Theme CSS', preview: '"Dark Theme CSS"' },
                  status: { type: 'string', value: 'loaded', preview: '"loaded"' },
                  bytes: { type: 'number', value: 3890, preview: '3890' },
                },
              },
              {
                type: 'object',
                entries: {
                  id: { type: 'number', value: 3, preview: '3' },
                  name: { type: 'string', value: 'Analytics Script', preview: '"Analytics Script"' },
                  status: { type: 'string', value: 'deferred', preview: '"deferred"' },
                  bytes: { type: 'number', value: 820, preview: '820' },
                },
              },
            ],
          },
          columns: ['id', 'name', 'status', 'bytes'],
        });
        break;
      case 'log-async':
        logStore.addEntry({
          level: 'error',
          category: 'unhandledrejection',
          message: 'Unhandled Promise Rejection: Network request to /api/feed timed out after 5000ms',
          stack: 'Error: Network request timed out\n    at fetchWithTimeout (preview.js:22:15)\n    at async loadData (preview.js:30:3)',
        });
        break;
      case 'clear':
        logStore.clear();
        break;
    }
  }

  switchVariant(key) {
    if (this.currentVariant === key) return;
    this.currentVariant = key;
    const currentObj = this.variants.find((v) => v.key === key) || this.variants[0];

    const label = this.switcherEl?.querySelector('#proto-variant-label');
    if (label) {
      label.innerHTML = `
        <span class="variant-key">${currentObj.key}</span>
        <span class="variant-title">${currentObj.name}</span>
      `;
    }

    // Update URL search param
    const url = new URL(window.location.href);
    url.searchParams.set('variant', key);
    window.history.replaceState({}, '', url.toString());

    this.onSwitch(key);
  }
}
