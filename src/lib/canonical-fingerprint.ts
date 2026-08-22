/** Canonical JSON and synchronous SHA-256 for immutable mechanics facts. */

export type CanonicalFingerprint = `sha256:${string}`;

const MAX_CANONICAL_CHARACTERS = 4 * 1024 * 1024;
const MAX_CANONICAL_DEPTH = 128;
const MAX_CANONICAL_NODES = 100_000;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;

function canonicalTypeError(): never {
  throw new TypeError("Canonical fingerprint input must be bounded plain JSON");
}

/**
 * Canonical text of trees whose every object node was frozen when the full
 * walk last ran. A deeply frozen plain-JSON tree is immutable (the walk
 * accepts data properties only — accessors are rejected — and freezing locks
 * values and prototypes), so its canonical form can never change and the
 * completed walk is reused. Trees containing any unfrozen node never cache.
 */
const frozenCanonicalJson = new WeakMap<object, string>();
const frozenCanonicalFingerprints = new WeakMap<object, CanonicalFingerprint>();

/**
 * Exact canonical form for plain JSON mechanics data.
 *
 * Object keys are sorted; array order is semantic. The boundary deliberately
 * rejects values whose JSON encoding would erase information or execute code.
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const cached = frozenCanonicalJson.get(value);
    if (cached !== undefined) return cached;
  }
  const chunks: string[] = [];
  const ancestors = new Set<object>();
  let characters = 0;
  let nodes = 0;
  let unfrozenNodes = 0;

  const append = (chunk: string): void => {
    characters += chunk.length;
    if (characters > MAX_CANONICAL_CHARACTERS) canonicalTypeError();
    chunks.push(chunk);
  };

  const visit = (current: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_CANONICAL_NODES || depth > MAX_CANONICAL_DEPTH) {
      canonicalTypeError();
    }

    if (current === null) {
      append("null");
      return;
    }
    if (typeof current === "string") {
      if (current.length > MAX_CANONICAL_CHARACTERS) canonicalTypeError();
      append(JSON.stringify(current));
      return;
    }
    if (typeof current === "boolean") {
      append(current ? "true" : "false");
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) canonicalTypeError();
      append(JSON.stringify(current));
      return;
    }
    if (typeof current !== "object") canonicalTypeError();
    if (ancestors.has(current)) canonicalTypeError();

    let prototype: object | null;
    let ownKeys: readonly PropertyKey[];
    try {
      prototype = Reflect.getPrototypeOf(current);
      ownKeys = Reflect.ownKeys(current);
    } catch {
      canonicalTypeError();
    }

    const isArray = Array.isArray(current);
    if (
      (isArray && prototype !== Array.prototype) ||
      (!isArray && prototype !== Object.prototype)
    ) {
      canonicalTypeError();
    }
    if (ownKeys.length > MAX_CANONICAL_NODES) canonicalTypeError();
    if (!Object.isFrozen(current)) unfrozenNodes += 1;

    ancestors.add(current);
    try {
      if (isArray) {
        const lengthDescriptor = Object.getOwnPropertyDescriptor(current, "length");
        if (
          !lengthDescriptor ||
          !("value" in lengthDescriptor) ||
          typeof lengthDescriptor.value !== "number" ||
          !Number.isSafeInteger(lengthDescriptor.value) ||
          lengthDescriptor.value < 0 ||
          ownKeys.length !== lengthDescriptor.value + 1 ||
          !ownKeys.includes("length")
        ) {
          canonicalTypeError();
        }
        append("[");
        for (let index = 0; index < lengthDescriptor.value; index += 1) {
          if (index > 0) append(",");
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
            canonicalTypeError();
          }
          visit(descriptor.value, depth + 1);
        }
        append("]");
        return;
      }

      const keys: string[] = [];
      for (const key of ownKeys) {
        if (typeof key !== "string" || UNSAFE_KEYS.has(key)) canonicalTypeError();
        keys.push(key);
      }
      keys.sort();
      append("{");
      for (const [index, key] of keys.entries()) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          canonicalTypeError();
        }
        if (index > 0) append(",");
        append(JSON.stringify(key));
        append(":");
        visit(descriptor.value, depth + 1);
      }
      append("}");
    } catch (error) {
      if (error instanceof TypeError) throw error;
      canonicalTypeError();
    } finally {
      ancestors.delete(current);
    }
  };

  visit(value, 0);
  const result = chunks.join("");
  if (unfrozenNodes === 0 && typeof value === "object" && value !== null) {
    frozenCanonicalJson.set(value, result);
  }
  return result;
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function requiredWord(words: ArrayLike<number>, index: number): number {
  const word = words[index];
  if (word === undefined) throw new RangeError("Invalid SHA-256 word index");
  return word;
}

function sha256(bytes: Uint8Array): string {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const prior = requiredWord(schedule, index - 15);
      const recent = requiredWord(schedule, index - 2);
      const sigma0 = rotateRight(prior, 7) ^ rotateRight(prior, 18) ^ (prior >>> 3);
      const sigma1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
      schedule[index] =
        (requiredWord(schedule, index - 16) +
          sigma0 +
          requiredWord(schedule, index - 7) +
          sigma1) >>>
        0;
    }

    let a = requiredWord(hash, 0);
    let b = requiredWord(hash, 1);
    let c = requiredWord(hash, 2);
    let d = requiredWord(hash, 3);
    let e = requiredWord(hash, 4);
    let f = requiredWord(hash, 5);
    let g = requiredWord(hash, 6);
    let h = requiredWord(hash, 7);

    for (let index = 0; index < 64; index += 1) {
      const constant = requiredWord(SHA256_CONSTANTS, index);
      const scheduled = requiredWord(schedule, index);
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constant + scheduled) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (requiredWord(hash, 0) + a) >>> 0;
    hash[1] = (requiredWord(hash, 1) + b) >>> 0;
    hash[2] = (requiredWord(hash, 2) + c) >>> 0;
    hash[3] = (requiredWord(hash, 3) + d) >>> 0;
    hash[4] = (requiredWord(hash, 4) + e) >>> 0;
    hash[5] = (requiredWord(hash, 5) + f) >>> 0;
    hash[6] = (requiredWord(hash, 6) + g) >>> 0;
    hash[7] = (requiredWord(hash, 7) + h) >>> 0;
  }

  return Array.from(hash, (value) => value.toString(16).padStart(8, "0")).join("");
}

/** Compact stable digest of canonical plain JSON data. */
export function canonicalFingerprint(value: unknown): CanonicalFingerprint {
  const cacheable = typeof value === "object" && value !== null;
  if (cacheable) {
    const cached = frozenCanonicalFingerprints.get(value);
    if (cached !== undefined) return cached;
  }
  const json = canonicalJson(value);
  const fingerprint: CanonicalFingerprint = `sha256:${sha256(new TextEncoder().encode(json))}`;
  // Cache only what the canonical walk itself proved deeply frozen.
  if (cacheable && frozenCanonicalJson.get(value) === json) {
    frozenCanonicalFingerprints.set(value, fingerprint);
  }
  return fingerprint;
}

/** Exact shared boundary for persisted mechanics fingerprints and revisions. */
export function conformCanonicalFingerprint(value: unknown): CanonicalFingerprint | null {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value)
    ? (value as CanonicalFingerprint)
    : null;
}
