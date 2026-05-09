// Global declarations for Node.js built-ins used in Next.js server context.
// In production, @types/node handles this. This file covers the dev container.

declare const process: {
  env: Record<string, string | undefined>;
  NODE_ENV: "development" | "production" | "test";
};

declare const Buffer: {
  from(data: string, encoding?: BufferEncoding): Uint8Array;
  from(data: ArrayBuffer): Uint8Array;
  isBuffer(obj: unknown): obj is Uint8Array;
};

type BufferEncoding =
  | "ascii" | "utf8" | "utf-8" | "utf16le" | "ucs2" | "ucs-2"
  | "base64" | "base64url" | "latin1" | "binary" | "hex";

// Crypto is available via import, not global — no declaration needed here.
