export function safeInternalPath(value: string | null, fallback = '/'): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32)
  )
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('//') || decoded.includes('\\')) return fallback;
    const url = new URL(value, 'https://console.invalid');
    return url.origin === 'https://console.invalid' && !url.pathname.startsWith('/login')
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
