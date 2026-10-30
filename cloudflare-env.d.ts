declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    // Supplied only by the independent Node runtime; Cloudflare uses D1 chunks.
    LOCAL_ATTACHMENTS?: {
      put(key: string, value: Uint8Array): Promise<void>;
      get(key: string): Promise<{ body: Uint8Array } | null>;
      delete(key: string): Promise<void>;
    };
    ADMIN_BOOTSTRAP_TOKEN_HASH?: string;
    ADMIN_EMAIL?: string;
    CLASS_ROSTER_JSON?: string;
    ADMIN_SETUP_TOKEN?: string;
    ADMIN_STUDENT_ID?: string;
    LOCAL_AUTH_ONLY?: string;
    PUBLIC_SITE_ORIGIN?: string;
  }
}
