/**
 * Static-serve guard (P7.8 / SEC-1 class).
 *
 * The root `express.static(__dirname)` mount would otherwise serve the ENTIRE
 * repository — including data/ (the durable session DB + all pipeline state),
 * source, config, and internal docs — to any UNauthenticated client over the
 * public Cloudflare tunnel. This denylist blocks the sensitive trees and file
 * types while leaving the legitimately-public files (published report*.html,
 * the console SPA under /console, session photos, marketing assets) servable.
 *
 * Denylist (not allowlist) by deliberate choice: preserve-by-default, so adding
 * a new public report/asset never needs a guard change; only sensitive paths
 * are enumerated. Returns 404 (not 403) so the guard does not confirm a file
 * exists.
 *
 * The matcher decodes + folds backslashes + normalizes `req.path` (the same view
 * serve-static resolves against the root) before testing the regexes, and fails
 * CLOSED on malformed input — otherwise an encoded dot (/server%2Ejs), a
 * backslash, or a ./.. segment would dodge the regex while the file still serves.
 */

const path = require('path');

// Whole directory trees that are entirely internal (never public).
const DENIED_DIR_PREFIXES = /^\/(data|node_modules|lib|scripts|__tests__|templates|emailer|docs|audit|coverage|config|archive)(\/|$)/i;

// Sensitive file extensions, anywhere in the tree (defense-in-depth: catches a
// stray DB / secret / internal working-doc even if it sits outside the dirs above).
const DENIED_EXTENSIONS = /\.(sqlite|sqlite-shm|sqlite-wal|db|env|bat|md|txt|log|csv|sql|pem|key|crt)$/i;

// Root-level source/config files (server.js, jest.config.js, package*.json,
// langgraph.json, *.yml, analysis/test JSON dumps). The single-segment anchor
// `[^/]+` matches ONLY files directly in the repo root — NOT /console/app.js or
// other nested public assets.
const DENIED_ROOT_SOURCE = /^\/[^/]+\.(js|json|ya?ml)$/i;

function isDeniedStaticPath(reqPath) {
  if (typeof reqPath !== 'string' || reqPath.length === 0) return false;
  // express.static (serve-static) DECODES and NORMALIZES the path before
  // resolving it against the root, so we must match the SAME view or an encoded
  // dot (/server%2Ejs), a backslash, or a ./.. segment dodges the regexes while
  // the file is still served. Fail CLOSED on anything we can't safely normalize.
  let decoded;
  try {
    decoded = decodeURIComponent(reqPath);
  } catch (e) {
    return true; // malformed %-encoding → deny
  }
  if (decoded.indexOf('\0') !== -1) return true; // NUL byte → deny
  // Windows serve-static treats '\' as a separator; fold to '/' before posix
  // normalize so backslash traversal/segments can't bypass the dir-prefix match.
  const normalized = path.posix.normalize(decoded.replace(/\\/g, '/'));
  return (
    DENIED_DIR_PREFIXES.test(normalized) ||
    DENIED_EXTENSIONS.test(normalized) ||
    DENIED_ROOT_SOURCE.test(normalized)
  );
}

/** Express middleware: 404 sensitive static paths before the root static mount. */
function staticGuard(req, res, next) {
  if (isDeniedStaticPath(req.path)) {
    return res.status(404).end();
  }
  return next();
}

module.exports = { isDeniedStaticPath, staticGuard };
