// A throwaway self-signed certificate for the local server's https (vercel-local.ts --tls), so Lighthouse
// measures the HTTP/2 that Vercel serves. Node has no API that writes a certificate, so the X.509 v3
// structure (RFC 5280 §4.1) is DER-encoded here, signed with an EC P-256 key made at each start; the pair
// lives in memory only and is trusted by no one: the browser that reaches it is told to ignore the error.
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const DAY = 24 * 60 * 60 * 1000;

/** One DER element: the tag, the definite length (X.690 §8.1.3), the content. */
function der(tag: number, ...content: Buffer[]): Buffer {
  const body = Buffer.concat(content);
  const length = body.length;
  if (length < 0x80) return Buffer.concat([Buffer.from([tag, length]), body]);
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 0x100)) bytes.unshift(rest % 0x100);
  return Buffer.concat([Buffer.from([tag, 0x80 | bytes.length, ...bytes]), body]);
}

const sequence = (...content: Buffer[]) => der(0x30, ...content);

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const groups = [arc % 0x80];
    for (let value = Math.floor(arc / 0x80); value > 0; value = Math.floor(value / 0x80)) {
      groups.unshift(0x80 | (value % 0x80));
    }
    bytes.push(...groups);
  }
  return der(0x06, Buffer.from(bytes));
}

/** UTCTime, YYMMDDHHMMSSZ: RFC 5280 §4.1.2.5 wants it for the years 1950 to 2049. */
function utcTime(date: Date): Buffer {
  return der(0x17, Buffer.from(`${date.toISOString().slice(2, 19).replace(/[-T:]/g, '')}Z`, 'ascii'));
}

/** A Name with one attribute, the common name. */
const commonName = (hostname: string) =>
  sequence(der(0x31, sequence(oid('2.5.4.3'), der(0x0c, Buffer.from(hostname, 'utf8')))));

const pem = (label: string, body: Buffer) =>
  `-----BEGIN ${label}-----\n${body.toString('base64').replace(/.{64}(?=.)/g, '$&\n')}\n-----END ${label}-----\n`;

/**
 * A certificate for `hostname` (subject CN and subjectAltName DNS), valid from a day before `now` to a week
 * after it, and its private key, both PEM.
 */
export function selfSignedCert({ hostname, now }: { hostname: string; now: Date }): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const ecdsaWithSha256 = sequence(oid('1.2.840.10045.4.3.2'));
  // A positive serial of 16 random bytes (RFC 5280 §4.1.2.2: at most 20 octets).
  const serial = randomBytes(16);
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x01;
  const name = commonName(hostname);
  const subjectAltName = sequence(der(0x82, Buffer.from(hostname, 'ascii')));
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ecdsaWithSha256,
    name,
    sequence(utcTime(new Date(now.getTime() - DAY)), utcTime(new Date(now.getTime() + 7 * DAY))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, sequence(sequence(oid('2.5.29.17'), der(0x04, subjectAltName)))),
  );
  // ECDSA's signature is DER already (dsaEncoding 'der'); a BIT STRING with no unused bits holds it.
  const signature = sign('sha256', tbs, privateKey);
  const cert = sequence(tbs, ecdsaWithSha256, der(0x03, Buffer.from([0]), signature));
  return { key: String(privateKey.export({ type: 'pkcs8', format: 'pem' })), cert: pem('CERTIFICATE', cert) };
}
