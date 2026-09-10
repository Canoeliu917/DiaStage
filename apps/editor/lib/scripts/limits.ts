export const SCRIPT_LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxExtractedCharacters: 300_000,
  requestTimeoutMs: 60_000,
  multipartOverheadBytes: 1024 * 1024,
  maxZipEntries: 1000,
  maxExpandedBytes: 60 * 1024 * 1024,
  maxXmlBytes: 16 * 1024 * 1024,
  maxConcurrentExtractions: 2,
} as const
