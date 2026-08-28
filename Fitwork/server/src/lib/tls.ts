import fs from "fs";
import path from "path";
import { config } from "../config";

// Whether this server instance actually ended up serving HTTPS — computed
// once, here, so every other module (session cookies, CSP) derives it from
// the same real filesystem check that startServer() in index.ts uses to
// decide http.createServer() vs https.createServer(), rather than each
// re-deriving its own answer (or worse, guessing from NODE_ENV). A Secure
// cookie issued while actually serving plain HTTP — the default fallback
// when no TLS cert is present, see index.ts — is accepted on login but
// silently dropped by the browser on every request after, since browsers
// never send a Secure cookie back over an insecure connection except on
// localhost. That looks exactly like a successful login immediately
// followed by a logout.
export const tlsKeyPath = path.resolve(__dirname, "../../../server", config.tlsKeyPath);
export const tlsCertPath = path.resolve(__dirname, "../../../server", config.tlsCertPath);
export const hasTlsCerts = fs.existsSync(tlsKeyPath) && fs.existsSync(tlsCertPath);
