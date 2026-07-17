import * as SecureStore from 'expo-secure-store';

export type ApiProvider = 'gemini' | 'openai';

const STORAGE_KEYS: Record<ApiProvider, string> = {
  gemini: 'gemini_api_key',
  openai: 'openai_api_key',
};

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
};

// Header/URL values can only legally contain visible ASCII — anything else (emoji, smart
// quotes, stray unicode picked up in a paste) crashes the native HTTP layer with an opaque
// "Unexpected char ... in Authorization value" instead of a normal, catchable error.
const VALID_KEY_PATTERN = /^[\x21-\x7E]+$/;

export class InvalidApiKeyError extends Error {}

function sanitize(key: string): string {
  // Strip whitespace/control/zero-width characters that paste often introduces silently.
  return key.replace(/[\s​-‍﻿]/g, '');
}

export async function getApiKey(provider: ApiProvider): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS[provider]);
}

export async function setApiKey(provider: ApiProvider, key: string): Promise<void> {
  const cleaned = sanitize(key);
  if (!VALID_KEY_PATTERN.test(cleaned)) {
    throw new InvalidApiKeyError(
      `This ${PROVIDER_LABELS[provider]} key contains a character API keys can’t have (like an emoji or accented letter). Re-copy the key and paste it again.`
    );
  }
  await SecureStore.setItemAsync(STORAGE_KEYS[provider], cleaned);
}

export async function clearApiKey(provider: ApiProvider): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS[provider]);
}
