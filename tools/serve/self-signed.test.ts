import { createPublicKey, X509Certificate } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { connect, createServer } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { selfSignedCert } from './self-signed.ts';

const NOW = new Date('2026-11-25T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('selfSignedCert', () => {
  const { key, cert } = selfSignedCert({ hostname: 'localhost', now: NOW });
  const parsed = new X509Certificate(cert);

  it('writes a PEM certificate and key for the host, signed by that key', () => {
    expect(cert).toMatch(/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----\n$/);
    expect(key).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(parsed.subject).toBe('CN=localhost');
    expect(parsed.issuer).toBe('CN=localhost');
    expect(parsed.subjectAltName).toBe('DNS:localhost');
    expect(parsed.verify(createPublicKey(key))).toBe(true);
    expect(parsed.publicKey.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
    expect(parsed.checkHost('localhost')).toBe('localhost');
  });

  it('is valid from a day before now to a week after it', () => {
    const from = new Date(parsed.validFrom).getTime();
    const to = new Date(parsed.validTo).getTime();
    expect(from).toBe(NOW.getTime() - DAY);
    expect(to).toBe(NOW.getTime() + 7 * DAY);
    expect(from).toBeLessThanOrEqual(NOW.getTime());
    expect(to).toBeGreaterThanOrEqual(NOW.getTime());
  });

  it('writes a new key and serial each time', () => {
    const other = selfSignedCert({ hostname: 'localhost', now: NOW });
    expect(other.key).not.toBe(key);
    expect(new X509Certificate(other.cert).serialNumber).not.toBe(parsed.serialNumber);
  });

  it('names another host when asked', () => {
    const other = new X509Certificate(selfSignedCert({ hostname: 'example.test', now: NOW }).cert);
    expect(other.subject).toBe('CN=example.test');
    expect(other.subjectAltName).toBe('DNS:example.test');
  });

  it('completes a TLS handshake that offers h2 by ALPN', async () => {
    const pair = selfSignedCert({ hostname: 'localhost', now: new Date() });
    const server = createServer({ ...pair, ALPNProtocols: ['h2'] }, (socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const protocol = await new Promise<string | false | null>((resolve, reject) => {
        const socket = connect(
          { port, host: '127.0.0.1', servername: 'localhost', rejectUnauthorized: false, ALPNProtocols: ['h2'] },
          () => {
            resolve(socket.alpnProtocol);
            socket.end();
          },
        );
        socket.on('error', reject);
      });
      expect(protocol).toBe('h2');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
