import os from "os";
import fs from "fs";
import { execSync } from "child_process";

interface Candidate { name: string; address: string; }

function nonInternalIPv4Candidates(): Candidate[] {
  const interfaces = os.networkInterfaces();
  const candidates: Candidate[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) candidates.push({ name, address: iface.address });
    }
  }
  return candidates;
}

// Best-effort: ask the OS which interface actually owns the default route,
// so a VPN/virtual adapter that also happens to hold a non-internal IPv4
// address (e.g. Hyper-V/WSL's 172.x.x.1) isn't picked over the real LAN
// adapter just because os.networkInterfaces() iterates it first. A machine
// can have more than one interface advertising a default route (a VPN
// commonly injects its own) — the OS's own route metric decides which one
// actually wins, so that's what this follows too, rather than just "has a
// gateway at all". Every branch is wrapped in try/catch: any failure here
// (missing command, unreadable proc file, unexpected format) just falls
// through to the name-based heuristic below — this must never crash
// startup over a best-effort log message.
function defaultRouteInterface(): { name?: string; address?: string } | null {
  try {
    if (process.platform === "win32") {
      const out = execSync("route print -4", { timeout: 3000 }).toString();
      // Columns: Network Destination, Netmask, Gateway, Interface, Metric —
      // "Interface" here is the local adapter's own IP for that route, not
      // a name, so no further name lookup is needed for this platform.
      let best: { address: string; metric: number } | null = null;
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\S+)\s+(\d+)$/);
        if (!m) continue;
        const [, , localAddress, metricStr] = m;
        const metric = Number(metricStr);
        if (!best || metric < best.metric) best = { address: localAddress, metric };
      }
      return best ? { address: best.address } : null;
    }

    if (process.platform === "darwin") {
      const out = execSync("route -n get default", { timeout: 3000 }).toString();
      const m = out.match(/interface:\s*(\S+)/);
      return m ? { name: m[1] } : null;
    }

    // Linux: read /proc/net/route directly rather than shelling out to
    // `ip`/`route` — those binaries aren't guaranteed present (e.g. many
    // minimal container images ship neither), while this file always is.
    // Destination "00000000" is the hex-encoded default route; Metric is
    // plain decimal. A default route can appear on more than one
    // interface, so pick the lowest metric, same as the Windows path.
    const raw = fs.readFileSync("/proc/net/route", "utf-8");
    let best: { name: string; metric: number } | null = null;
    for (const line of raw.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 7) continue;
      const [iface, destination, , , , , metricStr] = cols;
      if (destination !== "00000000") continue;
      const metric = Number(metricStr);
      if (!best || metric < best.metric) best = { name: iface, metric };
    }
    return best ? { name: best.name } : null;
  } catch {
    return null;
  }
}

// Interface name patterns typical of virtual/VPN/tunnel adapters — used
// only as a last-resort tiebreaker when the OS's own default-route lookup
// above is unavailable or didn't match any candidate. Never exhaustive by
// design (new VPN products name adapters differently all the time); the
// route-table lookup above is the real fix, this is just a softer fallback
// for when that fails outright.
const VIRTUAL_ADAPTER_NAME_PATTERN = /veth|vethernet|virtualbox|vmware|hyper-v|wsl|\btap\b|\btun\b|tailscale|zerotier|wireguard|npcap|loopback|\bppp\b/i;

export function detectLanIp(): string | null {
  const candidates = nonInternalIPv4Candidates();
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].address;

  const routeInfo = defaultRouteInterface();
  if (routeInfo?.address) {
    const match = candidates.find((c) => c.address === routeInfo.address);
    if (match) return match.address;
  }
  if (routeInfo?.name) {
    const match = candidates.find((c) => c.name === routeInfo.name);
    if (match) return match.address;
  }

  const nonVirtual = candidates.find((c) => !VIRTUAL_ADAPTER_NAME_PATTERN.test(c.name));
  return (nonVirtual ?? candidates[0]).address;
}
