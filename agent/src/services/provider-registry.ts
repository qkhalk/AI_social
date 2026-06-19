/**
 * Provider Registry
 *
 * Loads model providers and credentials from Supabase at startup,
 * decrypts API keys using ENCRYPTION_KEY, and caches in memory for fast lookup.
 *
 * Admin manages credentials through /admin/models UI:
 * - Add provider (seeded: openai, anthropic, google, meta, openrouter, custom)
 * - Add credential (provider + encrypted API key)
 * - Set default credential per provider
 * - Test credential (verify it works)
 *
 * Agent queries this registry to resolve `agent.model_credential_id` ->
 * {provider, decrypted api_key, base_url}.
 */

import { getSupabaseClient } from './supabase-client';
import { decrypt } from './encryption-service';

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'meta' | 'openrouter' | 'custom';

export interface ModelProvider {
  id: string;
  name: ProviderType;
  display_name: string;
  api_base_url: string | null;
  is_active: boolean;
}

export interface ModelCredential {
  id: string;
  provider_id: string;
  credential_name: string;
  decrypted_config: {
    api_key: string;
    base_url?: string;
    organization_id?: string;
  };
  is_default: boolean;
  is_active: boolean;
}

interface ProviderWithCredentials {
  provider: ModelProvider;
  credentials: ModelCredential[];
}

class ProviderRegistry {
  private byId = new Map<string, ProviderWithCredentials>();
  private defaultByProviderName = new Map<ProviderType, ModelCredential>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Load tất cả providers + credentials từ Supabase, giải mã API keys.
   * Gọi 1 lần ở startup (sau resolveConfig).
   * Idempotent — gọi nhiều lần chỉ load 1 lần.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.doLoad().catch((err) => {
      this.loadPromise = null;
      throw err;
    });
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    const { getEncryptionKey } = await import('../config');
    const encryptionKey = getEncryptionKey();
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY not configured');
    }

    const supabase = getSupabaseClient();

    // 1. Load providers
    const { data: providers, error: pErr } = await supabase
      .from('model_providers')
      .select('id, name, display_name, api_base_url, is_active')
      .eq('is_active', true);

    if (pErr) throw new Error(`Failed to load providers: ${pErr.message}`);
    if (!providers?.length) {
      console.warn('[provider-registry] No active providers found');
      this.loaded = true;
      return;
    }

    // 2. Load credentials cho các providers active
    const providerIds = providers.map((p: any) => p.id);
    const { data: credentials, error: cErr } = await supabase
      .from('model_credentials')
      .select('id, provider_id, credential_name, encrypted_config, is_default, is_active')
      .in('provider_id', providerIds)
      .eq('is_active', true);

    if (cErr) throw new Error(`Failed to load credentials: ${cErr.message}`);

    // 3. Group credentials theo provider
    const credsByProvider = new Map<string, any[]>();
    for (const cred of credentials ?? []) {
      if (!credsByProvider.has(cred.provider_id)) {
        credsByProvider.set(cred.provider_id, []);
      }
      credsByProvider.get(cred.provider_id)!.push(cred);
    }

    // 4. Build in-memory cache
    this.byId.clear();
    this.defaultByProviderName.clear();

    for (const p of providers as any[]) {
      const provider: ModelProvider = {
        id: p.id,
        name: p.name as ProviderType,
        display_name: p.display_name,
        api_base_url: p.api_base_url,
        is_active: p.is_active,
      };

      const allCreds = credsByProvider.get(p.id) ?? [];
      const validCreds: ModelCredential[] = [];

      for (const c of allCreds) {
        try {
          const decryptedJson = decrypt(c.encrypted_config, encryptionKey);
          const decryptedConfig = JSON.parse(decryptedJson);

          if (!decryptedConfig?.api_key) {
            console.warn(
              `[provider-registry] Skipping credential ${c.id} (${c.credential_name}): missing api_key in decrypted config`
            );
            continue;
          }

          validCreds.push({
            id: c.id,
            provider_id: c.provider_id,
            credential_name: c.credential_name,
            decrypted_config: decryptedConfig,
            is_default: c.is_default,
            is_active: c.is_active,
          });
        } catch (err) {
          // Silently skip invalid/corrupted credentials to avoid spam
          // (chỉ warn 1 lần khi startup, không spam mỗi tick)
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(
            `[provider-registry] Skipping credential ${c.id} (${c.credential_name}): ${reason}`
          );
        }
      }

      const creds = validCreds;

      this.byId.set(provider.id, { provider, credentials: creds });

      // Track default credential per provider name
      const defaultCred = creds.find((c) => c.is_default);
      if (defaultCred) {
        this.defaultByProviderName.set(provider.name, defaultCred);
      }
    }

    const totalCreds = Array.from(this.byId.values()).reduce(
      (sum, p) => sum + p.credentials.length,
      0
    );
    console.log(
      `[provider-registry] Loaded ${providers.length} provider(s), ${totalCreds} credential(s)`
    );

    this.loaded = true;
  }

  /**
   * Lấy provider + credential theo credential_id.
   * Trả về null nếu không tìm thấy.
   */
  getByCredentialId(credentialId: string): {
    provider: ModelProvider;
    credential: ModelCredential;
  } | null {
    for (const { provider, credentials } of this.byId.values()) {
      const cred = credentials.find((c) => c.id === credentialId);
      if (cred) return { provider, credential: cred };
    }
    return null;
  }

  /**
   * Lấy default credential cho 1 provider.
   */
  getDefaultCredential(providerName: ProviderType): ModelCredential | null {
    return this.defaultByProviderName.get(providerName) ?? null;
  }

  /**
   * Lấy tất cả credentials cho 1 provider.
   * Dùng cho fallback chain.
   */
  getAllCredentialsForProvider(providerName: ProviderType): ModelCredential[] {
    const result: ModelCredential[] = [];
    for (const { provider, credentials } of this.byId.values()) {
      if (provider.name === providerName) {
        result.push(...credentials);
      }
    }
    return result;
  }

  /**
   * Reload từ DB (gọi sau khi admin update credentials).
   */
  async refresh(): Promise<void> {
    this.loaded = false;
    this.loadPromise = null;
    await this.load();
  }

  /**
   * Lấy danh sách providers + credentials (cho admin UI / debug).
   */
  listAll(): Array<{ provider: ModelProvider; credentials: ModelCredential[] }> {
    return Array.from(this.byId.values()).map((p) => ({
      provider: p.provider,
      credentials: p.credentials,
    }));
  }
}

export const providerRegistry = new ProviderRegistry();