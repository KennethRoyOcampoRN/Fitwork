import "./env";
// Must be imported before any router is required — it patches Express 4's
// Router methods so a rejected promise from an async route handler is
// forwarded to next(err) like a synchronous throw would be, instead of
// becoming an unhandled rejection. Express 4 has no native support for this
// (Express 5 does); without it, an async handler that throws only reaches
// the error-handling middleware below by accident (if something happens to
// .catch() it), not by design.
import "express-async-errors";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config } from "./config";
import { detectLanIp } from "./lib/network";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { auditRouter } from "./routes/audit";
import { employeesRouter } from "./routes/employees";
import { vitalsRouter } from "./routes/vitals";
import { notesRouter } from "./routes/notes";
import { documentsRouter } from "./routes/documents";
import { medicationsRouter } from "./routes/medications";
import { apeRouter } from "./routes/ape";
import { templatesRouter } from "./routes/templates";
import { importsRouter } from "./routes/imports";
import { backupRouter } from "./routes/backup";
import { companiesRouter } from "./routes/companies";
import { settingsRouter } from "./routes/settings";
import { dentalRouter } from "./routes/dental";
import { reportsRouter } from "./routes/reports";
import { apeComprehensiveRouter } from "./routes/apeComprehensiveReport";
import { drugTestRouter } from "./routes/drugTest";
import { preEmploymentRouter } from "./routes/preEmployment";
import { certificatesRouter } from "./routes/certificates";
import { labTestsRouter } from "./routes/labTests";
import { labTestTypesRouter } from "./routes/labTestTypes";
import { reportsCsvRouter } from "./routes/reportsCsv";
import { getAppName } from "./services/appSettings";

// Last-resort safety net for async errors that occur outside any request's
// lifecycle (a background timer, a callback-style async function that
// throws before anything attaches a .catch, etc.) — express-async-errors
// above covers request handlers, but can't help with those. Node's default
// behavior for an unhandled rejection (since v15) is to terminate the
// process; for a single shared server, one such bug anywhere would end
// every other user's session mid-shift. Log and keep serving rather than
// exit — deliberately the opposite of Node's own general-purpose advice to
// treat these as fatal, because for this app "one bad request takes down
// everyone" is a worse failure mode than "this one bug's fallout is only
// logged, not crashed."
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server kept running):", err);
});

const app = express();

// Whether HTTPS will actually be used — decided here, before any
// middleware is built, rather than inside startServer() at the bottom of
// this file, because the CSP below needs to know it too (see
// upgradeInsecureRequests comment).
const tlsKeyPath = path.resolve(__dirname, "../../server", config.tlsKeyPath);
const tlsCertPath = path.resolve(__dirname, "../../server", config.tlsCertPath);
const hasTlsCerts = fs.existsSync(tlsKeyPath) && fs.existsSync(tlsCertPath);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        // helmet includes this directive by default, which tells the
        // browser to silently rewrite every asset/API request on the page
        // to https:// — fine when actually serving over HTTPS, but fatal
        // when falling back to plain HTTP (no TLS cert configured): the
        // browser tries to open a TLS connection to a plain HTTP socket
        // and every request fails with ERR_SSL_PROTOCOL_ERROR, producing a
        // white screen with no visible error except in the console. Must
        // track whether HTTPS is actually in use, not just assume it.
        upgradeInsecureRequests: hasTlsCerts ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: "same-origin" },
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

if (config.nodeEnv === "development") {
  app.use(cors({ origin: "https://localhost:5173", credentials: true }));
}

app.get("/api/health", async (_req, res) => res.json({ ok: true, appName: await getAppName() }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/audit", auditRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/vitals", vitalsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/medications", medicationsRouter);
app.use("/api/ape", apeRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/imports", importsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/dental", dentalRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/reports", apeComprehensiveRouter);
app.use("/api/reports", reportsCsvRouter);
app.use("/api/drug-tests", drugTestRouter);
app.use("/api/pre-employment", preEmploymentRouter);
app.use("/api/certificates", certificatesRouter);
app.use("/api/lab-tests", labTestsRouter);
app.use("/api/test-types", labTestTypesRouter);

// Serve built client as static files (single-port deployment)
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// Fails clearly and immediately if the configured database is unreachable,
// rather than letting some later query surface a cryptic low-level SQLITE
// error the first time a request happens to touch the database.
function checkDatabaseReachable() {
  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    console.error(
      `\nDatabase directory not found: ${dbDir}\n` +
      "Check DATABASE_PATH (or DATABASE_URL) in server/.env - the configured location is unreachable.\n" +
      "This must point to local disk, not a network share: SQLite does not handle file locking safely over network filesystems.\n"
    );
    process.exit(1);
  }
  if (!fs.existsSync(config.databasePath)) {
    console.error(
      `\nDatabase file not found: ${config.databasePath}\n` +
      "Run `npx prisma migrate deploy` from the server directory to create it (see docs/INSTALL.md).\n"
    );
    process.exit(1);
  }
}

function logStartup(protocol: "HTTPS" | "HTTP") {
  const modeLabel = config.serverMode === "server" ? "Server (LAN-accessible)" : "Standalone (this PC only)";
  console.log(`FITWORK server (${protocol}) listening on port ${config.port} - mode: ${modeLabel}`);
  if (config.serverMode === "server") {
    const lanIp = detectLanIp();
    if (lanIp) {
      console.log(`Connect from other PCs on the LAN at: ${protocol.toLowerCase()}://${lanIp}:${config.port}`);
    } else {
      console.warn("SERVER_MODE=server but no LAN IP could be auto-detected - other PCs may not be able to reach this server.");
    }
  }
}

function startServer() {
  checkDatabaseReachable();

  const host = config.serverMode === "server" ? "0.0.0.0" : "127.0.0.1";

  if (hasTlsCerts) {
    const server = https.createServer(
      { key: fs.readFileSync(tlsKeyPath), cert: fs.readFileSync(tlsCertPath) },
      app
    );
    server.listen(config.port, host, () => logStartup("HTTPS"));
  } else {
    console.warn(
      "No TLS certificate found. Falling back to HTTP - webcam capture will only work on 'localhost'.\n" +
      "To generate a LAN-trusted certificate with mkcert: on an installed copy, double-click Setup-HTTPS.bat " +
      "in the install folder (or the \"Set Up HTTPS\" Start Menu shortcut); in a dev checkout, run " +
      "`npm run setup:certs` from server/ (see docs/INSTALL.md)."
    );
    http.createServer(app).listen(config.port, host, () => logStartup("HTTP"));
  }
}

startServer();
