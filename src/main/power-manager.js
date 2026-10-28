'use strict';

const { execFile, exec } = require('node:child_process');

function getPowerPlans() {
  return new Promise((resolve) => {
    exec('powercfg /list', { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const plans = [];
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/Power Scheme GUID:\s*([a-f0-9\-]+)\s*\(([^)]+)\)(\s*\*?)/i);
        if (match) {
          const guid = match[1].trim();
          const name = match[2].trim();
          const active = match[3].includes('*');
          plans.push({ guid, name, active });
        }
      }
      resolve(plans);
    });
  });
}

function setActivePowerPlan(guid) {
  return new Promise((resolve) => {
    const clean = String(guid || '').replace(/[^a-f0-9\-]/gi, '').trim();
    if (!clean) return resolve({ ok: false, error: 'Invalid GUID' });

    exec(`powercfg /setactive ${clean}`, { windowsHide: true }, (err) => {
      resolve({ ok: !err, error: err ? err.message : null });
    });
  });
}

function getBatteryStatus() {
  return new Promise((resolve) => {
    const psScript = `
      $b = Get-WmiObject -Class Win32_Battery -ErrorAction SilentlyContinue
      if ($b) {
        $status = switch ($b.BatteryStatus) {
          1 { "Discharging" }
          2 { "AC Connected / Charging" }
          3 { "Fully Charged" }
          4 { "Low" }
          5 { "Critical" }
          6 { "Charging" }
          default { "Plugged In" }
        }
        [PSCustomObject]@{
          Present = $true
          ChargeRemaining = $b.EstimatedChargeRemaining
          Status = $status
          EstimatedRunTime = $b.EstimatedRunTime
        } | ConvertTo-Json -Compress
      } else {
        [PSCustomObject]@{
          Present = $false
          ChargeRemaining = 100
          Status = "Desktop / No Battery"
          EstimatedRunTime = 0
        } | ConvertTo-Json -Compress
      }
    `;

    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({ present: false, chargeRemaining: 100, status: 'Unknown' });
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve({
          present: data.Present,
          chargeRemaining: data.ChargeRemaining ?? 100,
          status: data.Status || 'Plugged In',
          estimatedRunTimeMinutes: data.EstimatedRunTime ?? 0
        });
      } catch {
        resolve({ present: false, chargeRemaining: 100, status: 'Unknown' });
      }
    });
  });
}

module.exports = {
  getPowerPlans,
  setActivePowerPlan,
  getBatteryStatus
};
