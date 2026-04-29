import {
  DEFAULT_PREFIX_LENGTH,
  MAX_PREFIX_LENGTH,
  MIN_PREFIX_LENGTH,
  PREFIX_CHARS,
} from "./prefix.constants.js";

export function buildPrefix(seed?: string | null) {
  const normalized = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalized.length >= MIN_PREFIX_LENGTH &&
    normalized.length <= MAX_PREFIX_LENGTH
  ) {
    return normalized;
  }

  const base = normalized.slice(0, DEFAULT_PREFIX_LENGTH);
  let prefix = base;
  for (let i = prefix.length; i < DEFAULT_PREFIX_LENGTH; i += 1) {
    prefix += PREFIX_CHARS[Math.floor(Math.random() * PREFIX_CHARS.length)];
  }
  return prefix;
}
