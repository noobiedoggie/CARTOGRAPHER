/**
 * Persistent storage via the Capacitor Preferences plugin (native
 * SharedPreferences on Android, localStorage on the web), with a plain
 * localStorage fallback if the plugin is unavailable.
 */
import { Preferences } from '@capacitor/preferences';

const PREFIX = 'cartographer.';

export async function loadJSON(key, fallback = null) {
  try {
    const { value } = await Preferences.get({ key: PREFIX + key });
    return value ? JSON.parse(value) : fallback;
  } catch {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
}

export async function saveJSON(key, obj) {
  const value = JSON.stringify(obj);
  try {
    await Preferences.set({ key: PREFIX + key, value });
  } catch {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      /* storage unavailable (private mode) - keep playing */
    }
  }
}

export async function remove(key) {
  try {
    await Preferences.remove({ key: PREFIX + key });
  } catch {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}
