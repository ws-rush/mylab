/**
 * In-Playground Console & Error Output Prototype Entry Point
 *
 * Question Settled:
 * "Three variants of the playground console & error output UI, switchable via ?variant=, on the existing playground route."
 *
 * Variants:
 * - Variant A: Editor Stack Accordion Pane (data-editor="console" inside right-side accordion stack)
 * - Variant B: Docked Bottom DevTools Panel (Full-width resizable bottom drawer + persistent status bar)
 * - Variant C: Preview Floating HUD & Overlay Drawer (Preview-anchored floating status pill + slide-up drawer)
 */

import { logStore } from './console-engine.js';
import { VariantA } from './variant-a.js';
import { VariantB } from './variant-b.js';
import { VariantC } from './variant-c.js';
import { PrototypeSwitcher } from './switcher.js';
import './prototype.css';

class ConsolePrototypeApp {
  constructor() {
    this.variants = [
      { key: 'A', name: 'Editor Accordion Pane', cls: VariantA },
      { key: 'B', name: 'Docked Bottom Panel', cls: VariantB },
      { key: 'C', name: 'Preview Floating HUD', cls: VariantC },
    ];
    this.currentVariantKey = this.getInitialVariant();
    this.activeVariantInstance = null;
    this.switcher = null;
  }

  getInitialVariant() {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('variant')?.toUpperCase();
    if (v && this.variants.some((item) => item.key === v)) {
      return v;
    }
    return 'A';
  }

  init() {
    this.setupMessageListener();
    this.mountVariant(this.currentVariantKey);

    this.switcher = new PrototypeSwitcher({
      variants: this.variants.map((v) => ({ key: v.key, name: v.name })),
      currentVariant: this.currentVariantKey,
      onSwitch: (newKey) => this.mountVariant(newKey),
    });
    this.switcher.mount();

    // Add initial welcome logs to demonstrate console readiness
    setTimeout(() => {
      if (logStore.entries.length === 0) {
        logStore.addEntry({
          level: 'info',
          args: [
            { type: 'string', value: 'mylab console ready 🚀', preview: 'mylab console ready 🚀' },
            {
              type: 'object',
              constructorName: 'PlaygroundEnv',
              preview: 'PlaygroundEnv { version: "0.1.0", live: true }',
              entries: {
                version: { type: 'string', value: '0.1.0', preview: '"0.1.0"' },
                live: { type: 'boolean', value: true, preview: 'true' },
              },
            },
          ],
        });
      }
    }, 400);
  }

  mountVariant(key) {
    if (this.activeVariantInstance) {
      this.activeVariantInstance.unmount();
      this.activeVariantInstance = null;
    }

    this.currentVariantKey = key;
    const variantDef = this.variants.find((v) => v.key === key) || this.variants[0];
    this.activeVariantInstance = new variantDef.cls();
    this.activeVariantInstance.mount();
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== 'mylab-preview') return;

      switch (data.type) {
        case 'console-log':
          logStore.addEntry({
            level: data.level || 'log',
            timestamp: data.timestamp || Date.now(),
            args: data.args || [],
          });
          break;

        case 'console-table':
          logStore.addEntry({
            level: 'table',
            timestamp: data.timestamp || Date.now(),
            data: data.data,
            columns: data.columns,
            args: data.args || [],
          });
          break;

        case 'console-clear':
          logStore.clear();
          break;

        case 'preview-error':
          logStore.addEntry({
            level: 'error',
            category: data.category || 'runtime',
            message: data.message || 'Error executing preview script',
            filename: data.filename,
            lineno: data.lineno,
            colno: data.colno,
            stack: data.stack,
            errorObj: data.errorObj,
            isFatal: data.category === 'syntax',
            timestamp: data.timestamp || Date.now(),
          });
          break;
      }
    });
  }

  notifyCodeReload() {
    logStore.onCodeReload();
  }
}

export const consolePrototypeApp = new ConsolePrototypeApp();
