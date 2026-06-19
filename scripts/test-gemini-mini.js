// Gemini E2E test — use correct API
process.chdir('/app');
(async () => {
  const { initSecretsStore } = require('/app/dist/services/secrets-store.js');
  const { resolveConfig } = require('/app/dist/config.js');
  const { providerRegistry } = require('/app/dist/services/provider-registry.js');
  const { callLLM } = require('/app/dist/services/llm-client.js');

  console.log('[1] initSecretsStore(/app/data/secrets.db)');
  await initSecretsStore('/app/data/secrets.db');
  console.log('[2] resolveConfig');
  resolveConfig();
  console.log('[3] providerRegistry.load()');
  await providerRegistry.load();

  const all = providerRegistry.listAll();
  console.log('[4] providers:', all.length);
  for (const p of all) {
    console.log('   -', p.provider.name, '(' + p.provider.display_name + ') creds:', p.credentials.length);
    for (const c of p.credentials) console.log('      cred:', c.credential_name, 'default:', c.is_default);
  }

  const g = providerRegistry.getDefaultCredential('google')
    || all.flatMap(p => p.provider.name === 'google' ? p.credentials : []).find(Boolean);
  if (!g) {
    console.log('---');
    console.log('NO GOOGLE CRED. Available providers:', all.map(p => p.provider.name).join(','));
    process.exit(1);
  }
  console.log('[5] using credential:', g.credential_name);

  try {
    const r = await callLLM({
      credentialId: g.id,
      messages: [
        { role: 'system', content: 'Ban la tro ly ngan gon.' },
        { role: 'user', content: 'Xin chao. Ban ten gi? Tra loi 1 cau.' },
      ],
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log('[6] REPLY:', r.content);
    console.log('[7] USAGE:', JSON.stringify(r.usage));
    console.log('[8] OK');
  } catch (e) {
    console.error('FAIL:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
  process.exit(0);
})();
