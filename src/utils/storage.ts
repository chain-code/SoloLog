const STORAGE_PREFIX = "SOLOLOG_";

function withPrefix(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

export function setItem(key: string, value: string) {
  localStorage.setItem(withPrefix(key), value);
}

export function getItem(key: string) {
  return localStorage.getItem(withPrefix(key));
}

export function removeItem(key: string) {
  localStorage.removeItem(withPrefix(key));
}
