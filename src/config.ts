/** Only public configuration belongs in the browser bundle. */
export const apiBaseUrl =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ||
  (import.meta.env.DEV ? '/api' : null);
