// Installed-machine equivalent of scripts/setup-certs.ts (which the
// installer never ships — the installed layout has no npm/tsx/scripts/ at
// all, only server/dist and a portable node.exe). Invoked via
// installer/Setup-HTTPS.bat, a double-clickable convenience wrapper the
// installer places at {app}\Setup-HTTPS.bat, so getting proper HTTPS after
// install is still zero-terminal for the admin, just a second double-click
// rather than a first-run-wizard checkbox — mkcert itself still needs to
// be installed separately by hand first (it isn't bundled).
//
// Reuses the same detectLanIp() adapter-preference logic as everywhere
// else in this app (see server/src/lib/network.ts) rather than the
// simpler, unordered version scripts/setup-certs.ts still uses — that
// script runs on a developer's own machine during initial setup, where a
// stray VPN/virtual adapter is a much rarer, easily-noticed edge case, but
// on an installed clinic PC we've already seen this preference matters.
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { detectLanIp } from "../lib/network";

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
      "Then re-run Setup-HTTPS.bat from the FITWORK install folder."
    );
    process.exitCode = 1;
    return;
  }

  // Matches config.tlsKeyPath/tlsCertPath's defaults (./certs/dev-key.pem,
  // relative to the server directory) so the running app picks these up
  // with no .env change needed.
  const certsDir = path.resolve(__dirname, "../../certs");
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
  console.log("Restart the FITWORK service for the new certificate to take effect: " +
    "open Services (services.msc), find FITWORK, and choose Restart.");
  if (!lanIp) {
    console.log(
      "\nCould not auto-detect a LAN IP — the certificate only covers localhost/127.0.0.1.\n" +
      "Other PCs on the network won't be able to reach this server over HTTPS yet."
    );
  } else {
    console.log(
      "\nNext: copy the mkcert root CA from this PC to each client PC and install it as a trusted " +
      "root CA (see docs\\INSTALL.md) so browsers on those machines trust this certificate too."
    );
  }
}

main();
