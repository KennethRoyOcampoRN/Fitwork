/*
 * Generates a LAN-trusted HTTPS certificate for the server via mkcert,
 * automating the manual steps documented in docs/INSTALL.md §4.
 * Run with: npm run setup:certs [-- extra-hostname ...]
 * Requires mkcert (https://github.com/FiloSottile/mkcert) already installed.
 */
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

function detectLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return null;
}

function mkcertAvailable(): boolean {
  try {
    execSync("mkcert -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main() {
  if (!mkcertAvailable()) {
    console.error(
      "mkcert was not found on PATH.\n" +
      "Install it first: https://github.com/FiloSottile/mkcert#installation\n" +
      "Then re-run: npm run setup:certs"
    );
    process.exit(1);
  }

  const certsDir = path.resolve(__dirname, "../server/certs");
  fs.mkdirSync(certsDir, { recursive: true });

  const lanIp = detectLanIp();
  const extraHostnames = process.argv.slice(2);
  const hosts = ["localhost", "127.0.0.1", ...(lanIp ? [lanIp] : []), ...extraHostnames];

  console.log("Installing the mkcert local CA (may prompt for your password)...");
  execSync("mkcert -install", { stdio: "inherit" });

  const keyPath = path.join(certsDir, "dev-key.pem");
  const certPath = path.join(certsDir, "dev-cert.pem");
  console.log(`\nGenerating certificate for: ${hosts.join(", ")}`);
  execSync(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" ${hosts.join(" ")}`, { stdio: "inherit" });

  console.log(`\nDone. Certificate written to ${certsDir}.`);
  if (!lanIp) {
    console.log(
      "Could not auto-detect a LAN IP — the certificate only covers localhost/127.0.0.1.\n" +
      "Other PCs on the network won't be able to reach this server over HTTPS yet.\n" +
      "Re-run with the machine's LAN IP and/or hostname as extra arguments, e.g.:\n" +
      "  npm run setup:certs -- 192.168.1.50 clinic-server.local"
    );
  } else {
    console.log(
      "Next: copy $(mkcert -CAROOT)/rootCA.pem to each client PC and install it as a trusted root CA " +
      "(see docs/INSTALL.md §4) so browsers on those machines trust this certificate too."
    );
  }
}

main();
