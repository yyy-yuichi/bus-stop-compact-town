// One-time encrypted stdin bridge. Private transfer key and plaintext never leave memory.
import { generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { createInterface } from 'node:readline';
import { saveCredential } from './jev-credential.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
console.log(JSON.stringify({ publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }));
const timeout = setTimeout(() => process.exit(2), 120000);
const input = createInterface({ input: process.stdin, terminal: false });
input.once('line', encrypted => {
  try {
    const plaintext = privateDecrypt({ key: pair.privateKey, oaepHash: 'sha256' }, Buffer.from(encrypted.trim(), 'base64'));
    console.log(JSON.stringify(saveCredential(plaintext.toString('utf8'), { replace: true })));
    plaintext.fill(0);
  } catch {
    console.error('Credential setup failed; secret and process output suppressed');
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    input.close();
  }
});
