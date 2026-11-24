'use client';
// Per-tab student session. Memory remains usable when a WebView blocks storage.
// Administrator credentials never use this transport.
const KEY = 'yi68.student.session';
let memoryToken: string | null = null;
export function studentSession() {
  if (memoryToken) return memoryToken;
  try {
    const token = sessionStorage.getItem(KEY);
    if (token && /^[a-f0-9]{64}$/.test(token)) memoryToken = token;
  } catch { /* In-memory sessions still work with all browser storage disabled. */ }
  return memoryToken;
}
export function saveStudentSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('登录状态有误，请重新登录。');
  memoryToken = token;
  try { sessionStorage.setItem(KEY, token); } catch { /* Use memory for this page. */ }
}
export function clearStudentSession() {
  memoryToken = null;
  try { sessionStorage.removeItem(KEY); } catch { /* No persistent storage. */ }
}
