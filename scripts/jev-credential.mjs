// Windows CurrentUser DPAPI storage. Never persist or print a plaintext API key.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function credentialPath(options = {}) {
  const localAppData = options.localAppData ?? globalThis.process?.env?.LOCALAPPDATA;
  if (!localAppData || (globalThis.process?.platform && globalThis.process.platform !== 'win32')) throw new Error('Windows local credential storage is required');
  return path.join(localAppData, 'Codex', 'credentials', 'busmap-typesafe.dpapi');
}

function dpapi(mode, input) {
  const operation = mode === 'protect'
    ? '$bytes = [Text.Encoding]::UTF8.GetBytes($inputValue); $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))'
    : '$bytes = [Convert]::FromBase64String($inputValue); $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))';
  const powershellExe = path.join(globalThis.process?.env?.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershellExe, ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.Security; $inputValue = [Console]::In.ReadToEnd(); ' + operation],
  { input, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  if (result.error || result.status !== 0) throw new Error(`DPAPI ${mode} failed (${result.error?.code ?? result.status}); no secret or process output logged`);
  return result.stdout;
}

export function protectCredential(key) {
  if (typeof key !== 'string' || key.length < 24 || /\s/.test(key)) throw new Error('Invalid API key shape');
  return dpapi('protect', key);
}

export function saveCredential(key, options = {}) {
  const destination = credentialPath(options);
  const encrypted = Buffer.from(protectCredential(key), 'base64');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, encrypted, { flag: options.replace ? 'w' : 'wx', mode: 0o600 });
  if (loadCredential(options) !== key) throw new Error('Credential readback failed');
  return { saved: true, encrypted: true, scope: 'Windows CurrentUser', path: destination };
}

export function loadCredential(options = {}) {
  const key = dpapi('unprotect', fs.readFileSync(credentialPath(options)).toString('base64'));
  if (key.length < 24 || /\s/.test(key)) throw new Error('Invalid decrypted credential');
  return key;
}
