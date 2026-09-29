// Clerk token cache backed by expo-secure-store (keeps the session across app launches).
import * as SecureStore from "expo-secure-store";

export interface TokenCache {
  getToken: (key: string) => Promise<string | null>;
  saveToken: (key: string, token: string) => Promise<void>;
  clearToken?: (key: string) => Promise<void>;
}

export const tokenCache: TokenCache = {
  async getToken(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // A corrupted/unreadable entry shouldn't brick sign-in; drop it and start fresh.
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // ignore
      }
      return null;
    }
  },
  async saveToken(key, token) {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch {
      // ignore — Clerk keeps the session in memory for this launch
    }
  },
  async clearToken(key) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};
