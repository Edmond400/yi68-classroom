import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

// OWASP scrypt profile: 16 MiB, r=8, p=5. No plaintext passwords are stored.
const params = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 32, params, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return ['scrypt', '16384', '8', '5', salt, (await derive(password, salt)).toString('hex')].join('$');
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$16384$8$5' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{64}$/.test(parts[5])) return false;
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'));
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export function matchesSecret(value: string, expected?: string) {
  return !!expected && timingSafeEqual(Buffer.from(digest(value)), Buffer.from(digest(expected)));
}
