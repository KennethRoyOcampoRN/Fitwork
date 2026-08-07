import fs from "fs";
import path from "path";
import { config } from "../config";

export function employeeDir(employeeCode: string, category: string): string {
  const dir = path.join(config.storageDir, employeeCode, category);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureStorageRoot() {
  fs.mkdirSync(config.storageDir, { recursive: true });
  fs.mkdirSync(path.join(config.storageDir, "_imports"), { recursive: true });
}

export function brandingDir(): string {
  const dir = path.join(config.storageDir, "_branding");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
