import { describe, it, expect, beforeEach } from 'vitest';

describe('Theme management and synchronization', () => {
  const THEME_STORAGE_KEY = 'mylab-theme';
  const THEME_ICONS = {
    system: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`,
    light: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>`,
    dark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`,
  };

  function getSavedThemePreference() {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'system' || saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {}
    return 'system';
  }

  function getSystemTheme(systemIsDark) {
    return systemIsDark ? 'dark' : 'light';
  }

  function resolveTheme(preference, systemIsDark) {
    if (preference === 'system') return getSystemTheme(systemIsDark);
    return preference;
  }

  function getNextThemePreference(current) {
    if (current === 'system') return 'light';
    if (current === 'light') return 'dark';
    return 'system';
  }

  function getThemeLabel(preference, resolved) {
    if (preference === 'system') {
      const resolvedLabel = resolved === 'dark' ? 'Dark' : 'Light';
      return `Theme: System (${resolvedLabel})`;
    }
    return preference === 'dark' ? 'Theme: Dark' : 'Theme: Light';
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('cycles through system -> light -> dark -> system preferences', () => {
    expect(getNextThemePreference('system')).toBe('light');
    expect(getNextThemePreference('light')).toBe('dark');
    expect(getNextThemePreference('dark')).toBe('system');
  });

  it('resolves system theme based on prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('generates correct descriptive labels for tooltip and aria-label', () => {
    expect(getThemeLabel('system', 'dark')).toBe('Theme: System (Dark)');
    expect(getThemeLabel('system', 'light')).toBe('Theme: System (Light)');
    expect(getThemeLabel('light', 'light')).toBe('Theme: Light');
    expect(getThemeLabel('dark', 'dark')).toBe('Theme: Dark');
  });

  it('persists preference in localStorage and handles missing/invalid values', () => {
    expect(getSavedThemePreference()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getSavedThemePreference()).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getSavedThemePreference()).toBe('light');

    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(getSavedThemePreference()).toBe('system');

    localStorage.setItem(THEME_STORAGE_KEY, 'invalid');
    expect(getSavedThemePreference()).toBe('system');
  });

  it('updates theme button and document attributes on simulated 3-way toggle', () => {
    let preference = 'system';
    let systemDark = true;
    let resolved = resolveTheme(preference, systemDark);

    const button = document.createElement('button');
    button.id = 'theme-button';
    document.body.appendChild(button);

    function apply() {
      resolved = resolveTheme(preference, systemDark);
      document.documentElement.dataset.theme = resolved;
      localStorage.setItem(THEME_STORAGE_KEY, preference);
      const label = getThemeLabel(preference, resolved);
      button.innerHTML = THEME_ICONS[preference];
      button.title = label;
      button.setAttribute('aria-label', label);
    }

    // 1. Initial system mode (system dark)
    apply();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(button.title).toBe('Theme: System (Dark)');
    expect(button.innerHTML).toContain('<rect');

    // 2. Toggle to light
    preference = getNextThemePreference(preference);
    apply();
    expect(preference).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(button.title).toBe('Theme: Light');
    expect(button.innerHTML).toContain('<circle');

    // 3. Toggle to dark
    preference = getNextThemePreference(preference);
    apply();
    expect(preference).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(button.title).toBe('Theme: Dark');
    expect(button.innerHTML).toContain('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"');

    // 4. Toggle back to system (system dark)
    preference = getNextThemePreference(preference);
    apply();
    expect(preference).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(button.title).toBe('Theme: System (Dark)');
    expect(button.innerHTML).toContain('<rect');

    // 5. System OS theme changes to light while in system mode
    systemDark = false;
    apply();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(button.title).toBe('Theme: System (Light)');

    button.remove();
  });
});
