import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseHighResolutionLoadText, parseInverterEventLogText } from '../js/offgrid-field-import.js';

describe('offgrid field import parser', () => {
  it('parses timestamped load CSV and summarizes peaks', () => {
    const csv = [
      'timestamp,power_kw',
      '2026-01-01 00:00,0.8',
      '2026-01-01 00:01,1.1',
      '2026-01-01 00:02,4.5',
      '2026-01-01 00:03,2.0',
      '2026-01-01 00:04,0.9'
    ].join('\n');
    const summary = parseHighResolutionLoadText(csv, { kind: 'load' });
    assert.equal(summary.kind, 'high-resolution-load');
    assert.equal(summary.intervalMinutes, 1);
    assert.equal(summary.sampleCount, 5);
    assert.equal(summary.observedPeakKw, 4.5);
    assert.equal(summary.derivedHourly8760Ready, false);
  });

  it('derives 8760 hourly series from year-long timestamped import', () => {
    const rows = ['timestamp,power_kw'];
    let timestamp = new Date('2026-01-01T00:00:00');
    for (let i = 0; i < 8760; i += 1) {
      rows.push(`${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:00,1`);
      timestamp = new Date(timestamp.getTime() + 3600000);
    }
    const summary = parseHighResolutionLoadText(rows.join('\n'), { kind: 'load' });
    assert.equal(summary.derivedHourly8760Ready, true);
    assert.equal(summary.derivedHourly8760.length, 8760);
  });

  it('parses inverter event logs and classifies overload/trip rows', () => {
    const csv = [
      'timestamp,severity,code,message',
      '2026-01-01 12:00,alarm,OVR-1,Overload trip detected',
      '2026-01-02 13:00,warning,BAT-2,Low battery voltage',
      '2026-01-03 14:00,error,FLT-7,Generic inverter fault'
    ].join('\n');
    const summary = parseInverterEventLogText(csv);
    assert.equal(summary.eventCount, 3);
    assert.equal(summary.tripCount, 1);
    assert.equal(summary.overloadCount, 1);
    assert.equal(summary.faultCount, 1);
    assert.equal(summary.batteryAlarmCount, 1);
  });
});
