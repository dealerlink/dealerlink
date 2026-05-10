import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

const OPTIONS = {
  // OWASP-recommended argon2id minimums
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, { ...OPTIONS, algorithm: 2 });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}
