/** Accepts "pulse.example.com" or a full URL. Assumes https:// when no scheme is typed. */
export function normalizeUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/** The API token travels in a header, so it is only ever sent over HTTPS. */
export const isHttps = (url: string) => /^https:\/\/[^\s/]/i.test(url);

export const HTTPS_REQUIRED = 'Pulse has to be reached over HTTPS, so your token stays encrypted. Enter an https:// address.';
