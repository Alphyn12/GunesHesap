import assert from 'node:assert/strict';

const elements = new Map();

function styleStub() {
  const values = {};
  return {
    values,
    setProperty(name, value) { values[name] = value; }
  };
}

function basicElement(id) {
  const el = { id, style: styleStub(), textContent: '' };
  elements.set(id, el);
  return el;
}

function labelElement(id) {
  const badge = { style: styleStub() };
  const el = {
    id,
    style: styleStub(),
    textContent: '',
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = value;
      this.textContent = String(value).replace(/<[^>]+>/g, '');
    },
    querySelector(selector) {
      return selector === '.rating-badge' ? badge : null;
    },
    badge
  };
  elements.set(id, el);
  return el;
}

globalThis.window = {
  i18n: {
    t: key => ({
      'onGridResult.prUnavailableShort': 'N/A',
      'onGridResult.prUnavailableLong': 'N/A (PR is not shown on the PSH fallback path)',
      'units.year': 'yıl'
    })[key] || key
  }
};
globalThis.document = {
  getElementById: id => elements.get(id) || null
};

const { renderPRGauge } = await import('../js/ui-charts.js');
const { formatPaybackYears } = await import('../js/ui-render.js');

window.i18n.translations = {
  onGridResult: {
    prUnavailableShort: 'N/A',
    prUnavailableLong: 'N/A (PR is not shown on the PSH fallback path)'
  },
  units: { year: 'yıl' }
};

const arc = basicElement('pr-arc-fill');
const needle = basicElement('pr-needle');
const value = basicElement('pr-gauge-val');
const label = labelElement('pr-gauge-label');

renderPRGauge(null);
assert.equal(value.textContent, 'N/A');
assert.equal(label.textContent, 'N/A (PR is not shown on the PSH fallback path)');
assert.equal(arc.style.strokeDashoffset, 251.3);
assert.equal(needle.style.transform, 'rotate(-90deg)');

const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = fn => { fn(); return 0; };
renderPRGauge(58.3);
globalThis.setTimeout = originalSetTimeout;

assert.equal(value.textContent, '58.3%');
assert.match(label.textContent, /Düşük - sistem kayıpları yüksek olabilir/);
assert.equal(label.badge.style.values['--c'], '#EF4444');

assert.equal(formatPaybackYears(0, 'yıl'), '>25 yıl');
assert.equal(formatPaybackYears(null, 'yıl'), '>25 yıl');
assert.equal(formatPaybackYears(9, 'yıl'), '9 yıl');
assert.equal(formatPaybackYears(32.56, 'yıl'), '32.6 yıl');

console.log('ui formatting tests passed');
