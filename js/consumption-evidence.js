// Shared consumption evidence checks for governance and calculation paths.

export function normalizeMonthlyConsumption(monthlyConsumption) {
  if (!Array.isArray(monthlyConsumption) || monthlyConsumption.length !== 12) return null;
  const values = monthlyConsumption.map(value => Number(value));
  if (values.some(value => !Number.isFinite(value) || value < 0)) return null;
  return values;
}

export function hasMeaningfulMonthlyConsumption(monthlyConsumption, { minAnnualKwh = 12, minPositiveMonths = 1 } = {}) {
  const values = normalizeMonthlyConsumption(monthlyConsumption);
  if (!values) return false;
  const annualKwh = values.reduce((sum, value) => sum + value, 0);
  const positiveMonths = values.filter(value => value > 0).length;
  return annualKwh >= minAnnualKwh && positiveMonths >= minPositiveMonths;
}

export function hasCompleteHourlyProfile8760(hourlyConsumption8760) {
  return Array.isArray(hourlyConsumption8760)
    && hourlyConsumption8760.length === 8760
    && hourlyConsumption8760.every(value => Number.isFinite(Number(value)) && Number(value) >= 0);
}

export function summarizeHourlyProfile8760(hourlyConsumption8760, { minPositiveValue = 1e-9 } = {}) {
  if (!hasCompleteHourlyProfile8760(hourlyConsumption8760)) return null;
  const values = hourlyConsumption8760.slice(0, 8760).map(value => Math.max(0, Number(value) || 0));
  const annualKwh = values.reduce((sum, value) => sum + value, 0);
  const peakKwh = values.reduce((max, value) => Math.max(max, value), 0);
  const positiveHours = values.filter(value => value > minPositiveValue).length;
  return {
    annualKwh,
    peakKwh,
    positiveHours,
    zeroHours: 8760 - positiveHours
  };
}

export function hasMeaningfulHourlyProfile8760(hourlyConsumption8760, {
  minAnnualKwh = 1,
  minPositiveHours = 1,
  minPeakKwh = 0,
  minPositiveValue = 1e-9
} = {}) {
  const summary = summarizeHourlyProfile8760(hourlyConsumption8760, { minPositiveValue });
  if (!summary) return false;
  return summary.annualKwh >= minAnnualKwh
    && summary.positiveHours >= minPositiveHours
    && summary.peakKwh > minPeakKwh;
}

export function validateHourlyProfile8760(hourlyConsumption8760, {
  label = '8760 saatlik profil',
  minAnnualKwh = 1,
  minPositiveHours = 1,
  minPeakKwh = 0,
  minPositiveValue = 1e-9
} = {}) {
  const summary = summarizeHourlyProfile8760(hourlyConsumption8760, { minPositiveValue });
  if (!summary) {
    return {
      ok: false,
      summary: null,
      errors: [`${label}: 8760 adet sonlu ve negatif olmayan saatlik değer gerekli.`]
    };
  }
  const errors = [];
  if (summary.annualKwh < minAnnualKwh) {
    errors.push(`${label}: yıllık toplam ${summary.annualKwh.toFixed(3)} kWh; en az ${minAnnualKwh} kWh olmalı.`);
  }
  if (summary.positiveHours < minPositiveHours) {
    errors.push(`${label}: pozitif saat sayısı ${summary.positiveHours}; en az ${minPositiveHours} olmalı.`);
  }
  if (summary.peakKwh <= minPeakKwh) {
    errors.push(`${label}: pik saatlik değer ${summary.peakKwh.toFixed(6)} kWh; sıfır/boş seri kabul edilmez.`);
  }
  return {
    ok: errors.length === 0,
    summary,
    errors
  };
}

export function hasMeaningfulConsumptionEvidence(state = {}) {
  return !!state.hasSignedCustomerBillData
    || hasMeaningfulMonthlyConsumption(state.monthlyConsumption)
    || hasMeaningfulHourlyProfile8760(state.hourlyConsumption8760, { minAnnualKwh: 12, minPositiveHours: 12 });
}
