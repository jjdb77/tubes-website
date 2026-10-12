'use strict';
// AI server for Studoo (on studoo.nl and on tubes.media for the Tubes Academy): the app sends its OpenAI request here with its
// licence as Bearer, this server adds the real OpenAI key and forwards it. The key never leaves the server.
// Copy of server/lib/ai-proxy.js in Studoo (studoo.nl uses the same); keep both copies equal.
//
// - Only our own models (MODELS, prices in USD per million tokens, as ai.config.json of Studoo).
// - Only known fields are forwarded (no tools, no web search); output tokens capped; store: false.
// - Spend per account per month in a JSON file; above capEur the request is refused with 402.
// - Streaming (SSE) is piped through; usage is read from the last events.
// Zero dependencies; res is a plain node:http ServerResponse (Express res works too).
const fs = require('fs');
const path = require('path');

const MODELS = {
  'gpt-5.6-terra': { in: 2.5, out: 15 },
  'gpt-5.6-sol': { in: 5, out: 30 },
  'gpt-5.6-luna': { in: 1, out: 6 },
};
const USD_TO_EUR = 0.92;
const MAX_TOKENS = 16000;
const FIELDS = {
  '/v1/responses': ['model', 'input', 'instructions', 'max_output_tokens', 'reasoning', 'text', 'stream'],
  '/v1/chat/completions': ['model', 'messages', 'max_completion_tokens', 'response_format', 'stream', 'stream_options'],
};

function usageOf(o) {
  if (!o || typeof o !== 'object') return null;
  const u = o.usage || (o.response && o.response.usage);
  if (!u || typeof u !== 'object') return null;
  const input = Number(u.input_tokens ?? u.prompt_tokens) || 0;
  const output = Number(u.output_tokens ?? u.completion_tokens) || 0;
  return input || output ? { input, output } : null;
}

function createAiProxy({ apiKey, usageFile, capEur = 5, upstream = 'https://api.openai.com', fetchImpl = globalThis.fetch, now = () => new Date(), log = console, timeoutMs = 180000 }) {
  const key = () => String((typeof apiKey === 'function' ? apiKey() : apiKey) || '').trim();
  const month = () => now().toISOString().slice(0, 7);

  function readUsage() {
    let u = null;
    try { u = JSON.parse(fs.readFileSync(usageFile, 'utf8')); } catch { u = null; }
    if (!u || u.month !== month() || typeof u.accounts !== 'object') u = { month: month(), accounts: {} };
    return u;
  }
  function record(account, usage, model) {
    const p = MODELS[model];
    const eur = ((usage.input * p.in + usage.output * p.out) / 1e6) * USD_TO_EUR;
    const u = readUsage();
    const a = u.accounts[account] || { eur: 0, calls: 0, input: 0, output: 0 };
    a.eur = Math.round((a.eur + eur) * 1e6) / 1e6; a.calls += 1; a.input += usage.input; a.output += usage.output; a.last = now().toISOString();
    u.accounts[account] = a;
    try {
      fs.mkdirSync(path.dirname(usageFile), { recursive: true });
      const tmp = `${usageFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(u, null, 1));
      fs.renameSync(tmp, usageFile);
    } catch (err) { log.error('[ai] usage not saved:', err.message); }
    return a;
  }
  const spent = (account) => (readUsage().accounts[account] || { eur: 0 }).eur;

  const json = (res, status, body) => { if (!res.headersSent) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); } };
  const fail = (res, status, message) => json(res, status, { error: { message } });

  // GET <base>/v1/models: the app's "Test" button. Answers without calling OpenAI.
  function models(res) {
    if (!key()) return fail(res, 503, 'AI is not configured on this server');
    json(res, 200, { object: 'list', data: Object.keys(MODELS).map((id) => ({ id, object: 'model' })) });
  }

  // route: '/v1/responses' | '/v1/chat/completions'; body: parsed JSON from the app; account: stable id per licence.
  async function forward({ account, route, body, res }) {
    if (!key()) return fail(res, 503, 'AI is not configured on this server');
    const fields = FIELDS[route];
    if (!fields) return fail(res, 404, 'Not found');
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'Invalid JSON');
    if (!MODELS[body.model]) return fail(res, 400, 'Model not available');
    if (spent(account) >= capEur) return fail(res, 402, 'Monthly AI limit reached');
    const out = {};
    for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
    const tokens = route === '/v1/responses' ? 'max_output_tokens' : 'max_completion_tokens';
    out[tokens] = Math.min(Number(out[tokens]) || 4000, MAX_TOKENS);
    if (route === '/v1/responses') out.store = false;
    if (out.stream && route === '/v1/chat/completions') out.stream_options = { include_usage: true };

    let r;
    try {
      r = await fetchImpl(upstream + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key()}` },
        body: JSON.stringify(out),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      log.error('[ai] upstream failed:', err.message);
      return fail(res, 502, 'AI service not reachable');
    }
    if (!r.ok) {
      let message = `AI service error (${r.status})`;
      try { const d = await r.json(); if (d && d.error && d.error.message) message = String(d.error.message).slice(0, 300); } catch { /* no JSON */ }
      // 401/403 upstream is our key, not the user's licence: never let the app think its licence is bad.
      const status = r.status === 401 || r.status === 403 ? 502 : r.status;
      if (status === 502) log.error('[ai] upstream refused the server key');
      return fail(res, status, message);
    }

    if (!out.stream) {
      const data = await r.json();
      const u = usageOf(data);
      if (u) record(account, u, out.model);
      return json(res, 200, data);
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    let usage = null; let buf = '';
    const dec = new TextDecoder();
    try {
      for await (const chunk of r.body) {
        res.write(chunk);
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:') || !line.includes('usage')) continue;
          try { usage = usageOf(JSON.parse(line.slice(5))) || usage; } catch { /* not JSON */ }
        }
      }
    } catch (err) { log.error('[ai] stream broke:', err.message); }
    if (usage) record(account, usage, out.model);
    res.end();
  }

  return { forward, models, spent, usage: readUsage, enabled: () => Boolean(key()), capEur };
}

module.exports = { createAiProxy, MODELS };
