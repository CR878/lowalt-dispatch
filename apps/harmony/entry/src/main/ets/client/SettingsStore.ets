import { preferences } from '@kit.ArkData';
import { AppHost } from './AppHost';

export const DEFAULT_API_BASE = 'http://192.168.1.10:8000';
const FILE_NAME = 'lowalt_settings';
const KEY_MODE = 'source_mode';
const KEY_BASE = 'api_base';
const KEY_ALERTS = 'alerts_json';

export class AppSettings {
  mode: string = 'mock';
  apiBase: string = DEFAULT_API_BASE;
}

export class SettingsStore {
  static load(): AppSettings {
    const settings = new AppSettings();
    try {
      const pref = preferences.getPreferencesSync(AppHost.requireContext(), { name: FILE_NAME });
      const mode = pref.getSync(KEY_MODE, 'mock');
      const base = pref.getSync(KEY_BASE, DEFAULT_API_BASE);
      if (typeof mode === 'string' && (mode === 'mock' || mode === 'http')) {
        settings.mode = mode;
      }
      if (typeof base === 'string' && base.length > 0) {
        settings.apiBase = base;
      }
    } catch (_err) {
      settings.mode = 'mock';
      settings.apiBase = DEFAULT_API_BASE;
    }
    return settings;
  }

  static save(settings: AppSettings): void {
    const pref = preferences.getPreferencesSync(AppHost.requireContext(), { name: FILE_NAME });
    const mode = settings.mode === 'http' ? 'http' : 'mock';
    pref.putSync(KEY_MODE, mode);
    pref.putSync(KEY_BASE, settings.apiBase.trim());
    pref.flushSync();
    SettingsStore.publish(settings);
  }

  static publish(settings: AppSettings): void {
    AppStorage.setOrCreate('sourceMode', settings.mode);
    AppStorage.setOrCreate('apiBase', settings.apiBase);
  }

  static readAlerts(): string {
    try {
      const pref = preferences.getPreferencesSync(AppHost.requireContext(), { name: FILE_NAME });
      const raw = pref.getSync(KEY_ALERTS, '[]');
      if (typeof raw === 'string') {
        return raw;
      }
    } catch (_err) {
      return '[]';
    }
    return '[]';
  }

  static writeAlerts(json: string): void {
    const pref = preferences.getPreferencesSync(AppHost.requireContext(), { name: FILE_NAME });
    pref.putSync(KEY_ALERTS, json);
    pref.flushSync();
  }
}
