// ═══════════════════════════════════════════════════════════
// PVGIS FETCH HARDENING TESTS
// ═══════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fetchPVGISLive,
  getPvgisSourceLabel,
  isPvgisParityAvailable,
  PVGIS_FETCH_STATUS
} from '../js/pvgis-fetch.js';

// ── Mock fetch yardımcıları ──────────────────────────────────────────────────

function makeMockFetch(responses) {
  let callCount = 0;
  return async (url, opts) => {
    const resp = responses[Math.min(callCount, responses.length - 1)];
    callCount++;
    if (resp === 'throw') throw new Error('Failed to fetch');
    if (resp === 'timeout-abort') {
      // Simulate abort
      if (opts?.signal) {
        await new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      }
      throw new Error('aborted');
    }
    return {
      ok: resp.ok !== false,
      status: resp.status || 200,
      json: async () => resp.body
    };
  };
}

const VALID_PVGIS_BODY = {
  outputs: {
    totals: { fixed: { E_y: 1200, 'H(i)_y': 1650 } },
    monthly: { fixed: Array.from({length:12}, (_, i) => ({ E_m: 100 })) }
  }
};

const VALID_SERIES_BODY = {
  outputs: {
    hourly: Array.from({ length: 8760 }, (_, i) => {
      const date = new Date(Date.UTC(2025, 0, 1, i));
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const hh = String(date.getUTCHours()).padStart(2, '0');
      return { time: `${yyyy}${mm}${dd}:${hh}10`, P: i % 24 >= 8 && i % 24 <= 16 ? 1000 : 0 };
    })
  }
};

const PARAMS = { lat: 39, lon: 32, peakpower: 5, loss: 0, angle: 30, aspect: 0 };

// ── 1. Başarılı canlı veri ───────────────────────────────────────────────────
describe('fetchPVGISLive — başarılı canlı veri', () => {
  it('LIVE_SUCCESS döner ve doğru verileri içerir', async () => {
    const fetchImpl = makeMockFetch([{ ok: true, body: VALID_PVGIS_BODY }]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.LIVE_SUCCESS);
    assert.equal(result.rawEnergy, 1200);
    assert.equal(result.rawPoa, 1650);
    assert.ok(Array.isArray(result.rawMonthly));
    assert.equal(result.rawMonthly.length, 12);
    assert.equal(result.errorType, null);
    assert.equal(result.userMessage, null);
  });

  it('endpointUsed dolu döner', async () => {
    const fetchImpl = makeMockFetch([{ ok: true, body: VALID_PVGIS_BODY }]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retryDelaysMs: [0,0,0] });
    assert.ok(result.endpointUsed && result.endpointUsed.includes('re.jrc'));
  });

  it('attemptCount 1 döner', async () => {
    const fetchImpl = makeMockFetch([{ ok: true, body: VALID_PVGIS_BODY }]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retryDelaysMs: [0,0,0] });
    assert.equal(result.attemptCount, 1);
  });

  it('includeHourly=true ise PVGIS seriescalc saatlik 8760 profilini ekler', async () => {
    const fetchImpl = makeMockFetch([
      { ok: true, body: VALID_PVGIS_BODY },
      { ok: true, body: VALID_SERIES_BODY }
    ]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retryDelaysMs: [0,0,0], includeHourly: true, hourlyTimeoutMs: 5000 });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.LIVE_SUCCESS);
    assert.equal(result.rawHourly.length, 8760);
    assert.ok(result.rawHourly.some(v => v > 0));
  });
});

// ── 2. HTTP hata sonrası retry + fallback ────────────────────────────────────
describe('fetchPVGISLive — HTTP hatası fallback', () => {
  it('HTTP 500 sonrası FALLBACK_USED döner', async () => {
    const fetchImpl = makeMockFetch([
      { ok: false, status: 500, body: {} },
      { ok: false, status: 503, body: {} },
      { ok: false, status: 503, body: {} }
    ]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
    assert.equal(result.rawEnergy, null);
    assert.ok(result.userMessage && result.userMessage.length > 0);
  });

  it('userMessage içinde teknik çöp metin yok (hayır "HTTP 500")', async () => {
    const fetchImpl = makeMockFetch([
      { ok: false, status: 500, body: {} },
      { ok: false, status: 500, body: {} },
      { ok: false, status: 500, body: {} }
    ]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
    // userMessage kullanıcıya gösterilir, ham HTTP kodu içermemeli
    assert.ok(!result.userMessage.includes('HTTP 500'));
  });
});

// ── 3. Network hatası fallback ────────────────────────────────────────────────
describe('fetchPVGISLive — ağ hatası fallback', () => {
  it('Failed to fetch → FALLBACK_USED', async () => {
    const fetchImpl = makeMockFetch(['throw', 'throw', 'throw']);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
    assert.equal(result.rawEnergy, null);
    assert.ok(result.errorType === 'network' || result.errorType === 'unknown');
  });

  it('userMessage Türkçe hata mesajı içerir (tr)', async () => {
    const fetchImpl = makeMockFetch(['throw', 'throw', 'throw']);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0, 0, 0], lang: 'tr' });
    assert.ok(result.userMessage && result.userMessage.length > 0);
    // Türkçe içermeli
    assert.ok(result.userMessage.includes('tahmini') || result.userMessage.includes('model') || result.userMessage.includes('alınamadı'));
  });

  it('userMessage İngilizce hata mesajı içerir (en)', async () => {
    const fetchImpl = makeMockFetch(['throw', 'throw', 'throw']);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0, 0, 0], lang: 'en' });
    assert.ok(result.userMessage && result.userMessage.toLowerCase().includes('estimated'));
  });
});

// ── 4. Boş / sıfır E_y yanıtı ────────────────────────────────────────────────
describe('fetchPVGISLive — boş E_y yanıtı', () => {
  it('E_y=0 → FALLBACK_USED', async () => {
    const emptyBody = { outputs: { totals: { fixed: { E_y: 0 } } } };
    const fetchImpl = makeMockFetch([
      { ok: true, body: emptyBody },
      { ok: true, body: emptyBody },
      { ok: true, body: emptyBody }
    ]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
  });

  it('E_y eksik → FALLBACK_USED', async () => {
    const badBody = { outputs: { totals: { fixed: {} } } };
    const fetchImpl = makeMockFetch([
      { ok: true, body: badBody },
      { ok: true, body: badBody },
      { ok: true, body: badBody }
    ]);
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 3, retryDelaysMs: [0,0,0] });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
  });
});

// ── 5. İlk deneme başarısız, ikinci başarılı ─────────────────────────────────
describe('fetchPVGISLive — retry başarısı', () => {
  it('ilk deneme başarısız, ikinci başarılı → LIVE_SUCCESS, attemptCount=2', async () => {
    const fetchImpl = makeMockFetch([
      { ok: false, status: 503, body: {} },
      { ok: true, body: VALID_PVGIS_BODY }
    ]);
    // Delay sıfır yaparak hız kazanılır (test ortamında)
    const result = await fetchPVGISLive(PARAMS, { fetchImpl, timeoutMs: 5000, retries: 2, retryDelaysMs: [0,0], retryHttpErrors: true });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.LIVE_SUCCESS);
    assert.equal(result.attemptCount, 2);
  });
});

// ── 6. Backend proxy — proxy-first davranışı ─────────────────────────────────
describe('fetchPVGISLive — proxy-first: proxy başarılı, direkt PVGIS denenmez', () => {
  it('proxy başarılı → PROXY_SUCCESS, re.jrc hiç çağrılmaz', async () => {
    let pvgisCallCount = 0;
    const fetchImpl = async (url) => {
      if (url.includes('re.jrc')) {
        pvgisCallCount++;
        throw new Error('Should not call direct PVGIS');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, rawEnergy: 1100, rawPoa: 1600, rawMonthly: null })
      };
    };
    const result = await fetchPVGISLive(PARAMS, {
      fetchImpl,
      timeoutMs: 5000,
      retries: 2,
      retryDelaysMs: [0, 0],
      backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
      proxyFirst: true,
    });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.PROXY_SUCCESS);
    assert.equal(result.rawEnergy, 1100);
    assert.equal(pvgisCallCount, 0, 'Direkt PVGIS çağrılmamalı — proxy yeterli');
  });

  it('proxy başarılı + includeHourly=true ise saatlik profil proxy yanıtından gelir', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes('re.jrc') && String(url).includes('PVcalc')) {
        throw new Error('Should not call direct PVcalc after proxy success');
      }
      if (String(url).includes('seriescalc')) {
        throw new Error('Should not call direct seriescalc after proxy success');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          rawEnergy: 1100,
          rawPoa: 1600,
          rawMonthly: null,
          rawHourly: new Array(8760).fill(0).map((_, i) => i % 24 >= 8 && i % 24 <= 16 ? 1 : 0)
        })
      };
    };
    const result = await fetchPVGISLive(PARAMS, {
      fetchImpl,
      timeoutMs: 5000,
      retries: 2,
      retryDelaysMs: [0, 0],
      backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
      proxyFirst: true,
      includeHourly: true,
      hourlyTimeoutMs: 5000
    });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.PROXY_SUCCESS);
    assert.equal(result.rawEnergy, 1100);
    assert.equal(result.rawHourly.length, 8760);
    assert.ok(calls[0].includes('includeHourly=1'));
    assert.ok(!calls.some(url => url.includes('seriescalc')));
    assert.ok(!calls.some(url => url.includes('PVcalc') && url.includes('re.jrc')));
  });
});

describe('fetchPVGISLive — proxy-first: proxy başarısız → direkt PVGIS devreye girer', () => {
  it('proxy HTTP 503 → direkt PVGIS başarılı → LIVE_SUCCESS', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('localhost')) {
        return { ok: false, status: 503, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => VALID_PVGIS_BODY };
    };
    const result = await fetchPVGISLive(PARAMS, {
      fetchImpl,
      timeoutMs: 5000,
      retries: 2,
      retryDelaysMs: [0, 0],
      backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
      proxyFirst: true,
    });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.LIVE_SUCCESS);
    assert.equal(result.rawEnergy, 1200);
  });

  it('proxy throws → direkt PVGIS başarılı → LIVE_SUCCESS', async () => {
    const fetchImpl = async (url) => {
      if (url.includes('localhost')) throw new Error('proxy unavailable');
      return { ok: true, status: 200, json: async () => VALID_PVGIS_BODY };
    };
    const result = await fetchPVGISLive(PARAMS, {
      fetchImpl,
      timeoutMs: 5000,
      retries: 2,
      retryDelaysMs: [0, 0],
      backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
      proxyFirst: true,
    });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.LIVE_SUCCESS);
  });
});

describe('fetchPVGISLive — proxy-first + direkt PVGIS her ikisi başarısız', () => {
  it('tüm tier başarısız → FALLBACK_USED, rawEnergy=null', async () => {
    const fetchImpl = async () => { throw new Error('all fail'); };
    const result = await fetchPVGISLive(PARAMS, {
      fetchImpl,
      timeoutMs: 5000,
      retries: 2,
      retryDelaysMs: [0, 0],
      backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
      proxyFirst: true,
    });
    assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
    assert.equal(result.rawEnergy, null);
    assert.ok(result.userMessage && result.userMessage.length > 0);
  });
});

describe('fetchPVGISLive — browser CORS guard', () => {
  it('browser ortamında proxy başarısızsa direkt PVGIS çağrısını denemez', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {};
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes('localhost')) throw new Error('proxy unavailable');
      throw new Error('Direct PVGIS should be blocked in browser mode');
    };
    try {
      const result = await fetchPVGISLive(PARAMS, {
        fetchImpl,
        timeoutMs: 5000,
        retries: 2,
        retryDelaysMs: [0, 0],
        backendProxyUrl: 'http://localhost:5000/api/pvgis-proxy',
        proxyFirst: true,
      });
      assert.equal(result.fetchStatus, PVGIS_FETCH_STATUS.FALLBACK_USED);
      assert.equal(result.errorType, 'proxy-unavailable');
      assert.ok(calls.every(url => url.includes('localhost')));
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
});

// ── 7. getPvgisSourceLabel ────────────────────────────────────────────────────
describe('getPvgisSourceLabel', () => {
  it('LIVE_SUCCESS → PVGIS Canlı (tr)', () => {
    assert.equal(getPvgisSourceLabel(PVGIS_FETCH_STATUS.LIVE_SUCCESS, 'tr'), 'PVGIS Canlı');
  });
  it('PROXY_SUCCESS → PVGIS Canlı (Proxy) (tr)', () => {
    assert.equal(getPvgisSourceLabel(PVGIS_FETCH_STATUS.PROXY_SUCCESS, 'tr'), 'PVGIS Canlı (Proxy)');
  });
  it('FALLBACK_USED → PSH Tahmini (tr)', () => {
    assert.equal(getPvgisSourceLabel(PVGIS_FETCH_STATUS.FALLBACK_USED, 'tr'), 'PSH Tahmini');
  });
  it('LIVE_SUCCESS → PVGIS Live (en)', () => {
    assert.equal(getPvgisSourceLabel(PVGIS_FETCH_STATUS.LIVE_SUCCESS, 'en'), 'PVGIS Live');
  });
  it('FALLBACK_USED → PSH Estimate (en)', () => {
    assert.equal(getPvgisSourceLabel(PVGIS_FETCH_STATUS.FALLBACK_USED, 'en'), 'PSH Estimate');
  });
});

// ── 8. isPvgisParityAvailable ─────────────────────────────────────────────────
describe('isPvgisParityAvailable', () => {
  it('canlı veri + backend var → true', () => {
    assert.equal(isPvgisParityAvailable(PVGIS_FETCH_STATUS.LIVE_SUCCESS, true), true);
  });
  it('fallback + backend var → false', () => {
    assert.equal(isPvgisParityAvailable(PVGIS_FETCH_STATUS.FALLBACK_USED, true), false);
  });
  it('canlı veri + backend yok → false', () => {
    assert.equal(isPvgisParityAvailable(PVGIS_FETCH_STATUS.LIVE_SUCCESS, false), false);
  });
  it('proxy + backend var → false (sadece live=true için parity)', () => {
    assert.equal(isPvgisParityAvailable(PVGIS_FETCH_STATUS.PROXY_SUCCESS, true), false);
  });
});

// ── 9. Parity dürüstlüğü ─────────────────────────────────────────────────────
describe('Parity dürüstlüğü — 0% fark vs kıyaslama yok ayrımı', () => {
  it('fallback durumunda parity false olmalı — sıfır fark gösterilmemeli', () => {
    const parityAvail = isPvgisParityAvailable(PVGIS_FETCH_STATUS.FALLBACK_USED, false);
    assert.equal(parityAvail, false, 'Fallback durumunda parity available=false olmalı');
  });

  it('canlı veri başarılı ama backend yoksa parity false', () => {
    const parityAvail = isPvgisParityAvailable(PVGIS_FETCH_STATUS.LIVE_SUCCESS, false);
    assert.equal(parityAvail, false, 'Backend yoksa parity=false');
  });
});
