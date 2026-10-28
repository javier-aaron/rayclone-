'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, exec } = require('node:child_process');

const HOSTS_PATH = process.platform === 'win32'
  ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
  : '/etc/hosts';

const SAMPLE_HOSTS = `# Copyright (c) 1993-2009 Microsoft Corp.
# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.

127.0.0.1       localhost
::1             localhost
# 127.0.0.1     dev.internal.company.com
127.0.0.1       api.local staging.local # staging endpoints
# 0.0.0.0       telemetry.blocked.com
`;

let cachedContent = '';
let cachedRules = [];

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/**
 * Validates whether a token is a valid IPv4 address or IPv6 address.
 * Rejects English words ending with colon (Note:, Warning:) and localhost.
 */
function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (IPV4_REGEX.test(ip)) return true;
  const clean = ip.replace(/%[a-zA-Z0-9._-]+$/, '');
  return IPV6_REGEX.test(clean);
}

/**
 * Parses hosts file content into structured rule objects.
 * Accurately classifies active IPv4/IPv6 rules, disabled commented rules,
 * inline comments, and multi-domain lines while ignoring pure comments.
 */
function parseHosts(content) {
  const lines = String(content || '').split(/\r?\n/);
  const rules = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed) continue;

    let enabled = true;
    let text = trimmed;
    if (text.startsWith('#')) {
      enabled = false;
      text = text.slice(1).trim();
    }

    const inlineCommentIdx = text.indexOf('#');
    let inlineComment = '';
    if (inlineCommentIdx !== -1) {
      inlineComment = text.slice(inlineCommentIdx + 1).trim();
      text = text.slice(0, inlineCommentIdx).trim();
    }

    const parts = text.split(/\s+/);
    const ip = parts[0];
    const domains = parts.slice(1);

    const isIp = isValidIp(ip);
    if (isIp && domains.length > 0) {
      for (const domain of domains) {
        rules.push({
          id: `host:${domain}:${idx}`,
          lineIndex: idx,
          ip,
          domain,
          enabled,
          isEnabled: enabled,
          comment: inlineComment,
          originalLine: line
        });
      }
    }
  }
  return rules;
}

/**
 * Toggles a rule between enabled and disabled in the provided hosts content.
 * For multi-domain lines, isolates and toggles only the targeted domain.
 */
function toggleRule(rule, content) {
  if (!content || !content.trim()) return content || '';
  const lines = String(content || '').split(/\r?\n/);
  if (!rule || rule.lineIndex < 0 || rule.lineIndex >= lines.length) return content;

  const rawLine = lines[rule.lineIndex];
  if (!rawLine || !rawLine.trim()) return content;

  let stripped = rawLine.trim();
  let lineComment = '';
  const isLineDisabled = stripped.startsWith('#');
  if (isLineDisabled) {
    stripped = stripped.replace(/^#+\s*/, '');
  }
  const commentIdx = stripped.indexOf('#');
  if (commentIdx !== -1) {
    lineComment = stripped.slice(commentIdx + 1).trim();
    stripped = stripped.slice(0, commentIdx).trim();
  }

  const parts = stripped.split(/\s+/);
  const ip = parts[0];
  const domains = parts.slice(1);

  if (isValidIp(ip) && domains.length > 1 && rule.domain && domains.includes(rule.domain)) {
    const remainingDomains = domains.filter((d) => d !== rule.domain);
    const commentPart = lineComment ? ` # ${lineComment}` : '';
    if (rule.enabled) {
      const remainingLine = `${ip}\t${remainingDomains.join(' ')}${commentPart}`;
      const toggledLine = `# ${ip}\t${rule.domain}`;
      lines.splice(rule.lineIndex, 1, remainingLine, toggledLine);
    } else {
      const remainingLine = `# ${ip}\t${remainingDomains.join(' ')}${commentPart}`;
      const toggledLine = `${ip}\t${rule.domain}`;
      lines.splice(rule.lineIndex, 1, remainingLine, toggledLine);
    }
  } else {
    if (rule.enabled) {
      lines[rule.lineIndex] = `# ${rawLine.replace(/^\s*#\s*/, '')}`;
    } else {
      lines[rule.lineIndex] = rawLine.replace(/^\s*#\s*/, '');
    }
  }
  return lines.join('\n');
}

/**
 * Reads hosts file content from disk.
 */
function readHosts() {
  try {
    if (fs.existsSync(HOSTS_PATH)) {
      cachedContent = fs.readFileSync(HOSTS_PATH, 'utf8');
      cachedRules = parseHosts(cachedContent);
      return cachedContent;
    }
  } catch {}

  cachedContent = SAMPLE_HOSTS;
  cachedRules = parseHosts(cachedContent);
  return cachedContent;
}

/**
 * Safely saves edited hosts content using standard write or elevated UAC staging.
 */
function saveHosts(newContent) {
  return new Promise((resolve) => {
    try {
      fs.writeFileSync(HOSTS_PATH, newContent, 'utf8');
      cachedContent = newContent;
      cachedRules = parseHosts(newContent);
      flushDns();
      return resolve({ ok: true, elevated: false });
    } catch {
      // Direct write failed (EPERM/EACCES), use safe elevated staging
      const tempPath = path.join(os.tmpdir(), 'rayclone-hosts.tmp');
      try {
        fs.writeFileSync(tempPath, newContent, 'utf8');
        const elevateCmd = `Start-Process cmd.exe -Verb RunAs -ArgumentList '/c copy /y "${tempPath}" "${HOSTS_PATH}" & ipconfig /flushdns' -WindowStyle Hidden`;
        execFile('powershell.exe', ['-NoProfile', '-Command', elevateCmd], { windowsHide: true }, (err) => {
          if (!err) {
            cachedContent = newContent;
            cachedRules = parseHosts(newContent);
          }
          resolve({ ok: !err, elevated: true });
        });
      } catch (err2) {
        resolve({ ok: false, error: err2.message });
      }
    }
  });
}

/**
 * Flushes Windows DNS resolver cache.
 */
function flushDns() {
  return new Promise((resolve) => {
    execFile('ipconfig.exe', ['/flushdns'], { windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, output: stdout });
    });
  });
}

/**
 * 1-click toggle of a hosts rule on disk.
 */
async function toggleHostRule(rule) {
  const content = readHosts();
  const updated = toggleRule(rule, content);
  return saveHosts(updated);
}

/**
 * Appends a new IP and domain rule to the hosts file.
 */
async function addRule(ip, domain, comment = '') {
  let content = readHosts();
  const ruleLine = comment ? `${ip}\t${domain}\t# ${comment}` : `${ip}\t${domain}`;
  const updated = content.trimEnd() + '\n' + ruleLine + '\n';
  return saveHosts(updated);
}

function getRules() {
  if (!cachedContent) readHosts();
  return cachedRules;
}

module.exports = {
  HOSTS_PATH,
  SAMPLE_HOSTS,
  parseHosts,
  toggleRule,
  readHosts,
  saveHosts,
  flushDns,
  toggleHostRule,
  addRule,
  getRules
};
