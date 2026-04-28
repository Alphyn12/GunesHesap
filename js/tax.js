// ═══════════════════════════════════════════════════════════
// TAX — Vergi Avantajı Hesabı (Faz D3)
// Solar Rota v2.0
// ═══════════════════════════════════════════════════════════

export function toggleTaxBlock() {
  const tog = document.getElementById('tax-toggle');
  if (tog) { tog.checked = !tog.checked; onTaxToggle(tog.checked); }
}

export function onTaxToggle(checked) {
  const state = window.state;
  state.taxEnabled = checked;
  const block = document.getElementById('tax-block');
  if (block) block.style.display = checked ? 'block' : 'none';
  if (checked && !state.tax) {
    state.tax = {
      corporateTaxRate: 25,
      amortizationYears: 10,
      kdvRecovery: true,
      investmentContribution: 0,
      hasIncentiveCert: false
    };
    updateTaxPreview();
  }
}

export function updateTaxInput() {
  const state = window.state;
  if (!state.tax) state.tax = {};

  state.tax.corporateTaxRate = parseFloat(document.getElementById('tax-rate')?.value) || 25;
  state.tax.amortizationYears = parseInt(document.getElementById('tax-amort')?.value) || 10;
  state.tax.kdvRecovery = document.getElementById('tax-kdv')?.checked ?? true;
  state.tax.investmentContribution = parseFloat(document.getElementById('tax-invest-rate')?.value) || 0;
  state.tax.hasIncentiveCert = document.getElementById('tax-incentive-cert')?.checked ?? false;

  updateTaxPreview();
}

function updateTaxPreview() {
  const state = window.state;
  const tax = state.tax;
  if (!tax || !state.results) return;

  const totalCost = state.results.totalCost || 0;
  if (totalCost <= 0) return;

  const amortYears = tax.amortizationYears || 10;
  const kvRate = (tax.corporateTaxRate || 25) / 100;
  const annual_dep = totalCost / amortYears;
  const annual_shield = annual_dep * kvRate;
  const kdv = tax.kdvRecovery ? totalCost * 0.20 : 0;
  const investContrib = tax.hasIncentiveCert ? totalCost * ((tax.investmentContribution || 0) / 100) : 0;
  const cumulative10 = annual_shield * amortYears + kdv + investContrib;

  // Yıl bazlı tablo (10 yıl)
  const rows = Array.from({ length: amortYears }, (_, i) => {
    const year = i + 1;
    const cumShield = annual_shield * year;
    return `<tr>
      <td class="tax-table-td">${year}</td>
      <td class="tax-table-td">${Math.round(annual_dep).toLocaleString('tr-TR')} ₺</td>
      <td class="tax-table-td">${Math.round(annual_shield).toLocaleString('tr-TR')} ₺</td>
      <td class="tax-table-td tax-table-td--success">${Math.round(cumShield).toLocaleString('tr-TR')} ₺</td>
    </tr>`;
  }).join('');

  const prevEl = document.getElementById('tax-preview');
  if (prevEl) {
    prevEl.innerHTML = `
      <div class="tax-callout">
        <div class="tax-callout-title">Mevzuat Dayanakları</div>
        <div>• <strong>KDV İadesi</strong> → 3065 Sayılı KDV Kanunu Md. 13/ı (yenilenebilir enerji istisnası)</div>
        <div>• <strong>Amortisman</strong> → 213 Sayılı VUK + Amort. Listesi No. 3-b (yenilenebilir enerji tesisi, 10 yıl)</div>
        <div>• <strong>Yatırım Katkısı</strong> → 5520 Sayılı KVK Md. 32/A — Yatırım Teşvik Belgesi ile Bölge 1–6 arası %15–45</div>
      </div>
      <div class="tax-stat-grid">
        <div class="hp-stat-card">
          <div class="tax-stat-value-1-1 tax-stat-value-1-1--success">${Math.round(kdv).toLocaleString('tr-TR')} ₺</div>
          <div class="text-muted-7">KDV iadesi (tek seferlik)</div>
        </div>
        <div class="hp-stat-card">
          <div class="tax-stat-value-1-1 tax-stat-value-1-1--accent">${Math.round(annual_shield).toLocaleString('tr-TR')} ₺</div>
          <div class="text-muted-7">Yıllık vergi kalkanı</div>
        </div>
        <div class="hp-stat-card">
          <div class="tax-stat-value-1-1 tax-stat-value-1-1--primary">${Math.round(investContrib).toLocaleString('tr-TR')} ₺</div>
          <div class="text-muted-7">Yatırım katkı payı</div>
        </div>
        <div class="hp-stat-card">
          <div class="tax-stat-value-1-1 tax-stat-value-1-1--success">${Math.round(cumulative10).toLocaleString('tr-TR')} ₺</div>
          <div class="text-muted-7">${amortYears} yıl kümülatif avantaj</div>
        </div>
      </div>
      <div class="tax-table-wrap">
        <table class="tax-table">
          <thead>
            <tr class="tax-table-tr-header">
              <th class="tax-table-th">Yıl</th>
              <th class="tax-table-th">Amortisman</th>
              <th class="tax-table-th">Vergi Kalkanı</th>
              <th class="tax-table-th">Kümülatif</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

// window'a expose et
window.toggleTaxBlock = toggleTaxBlock;
window.onTaxToggle = onTaxToggle;
window.updateTaxInput = updateTaxInput;
