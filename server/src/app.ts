import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { config, isProduction } from "./config.js";
import { errorHandler, notFound } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { clientsRouter } from "./routes/clients.js";
import { invoicesRouter } from "./routes/invoices.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: isProduction ? config.clientOrigin : true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    "/uploads",
    express.static(path.resolve(projectRoot, config.uploadDir), {
      fallthrough: false
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "duetracker" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/workspaces", requireAuth, workspacesRouter);
  app.use(
    "/api/workspaces/:workspaceId/clients",
    requireAuth,
    clientsRouter
  );
  app.use(
    "/api/workspaces/:workspaceId/invoices",
    requireAuth,
    invoicesRouter
  );
  app.use(
    "/api/workspaces/:workspaceId/dashboard",
    requireAuth,
    dashboardRouter
  );
  app.use(
    "/api/workspaces/:workspaceId/reports",
    requireAuth,
    reportsRouter
  );
  app.use(
    "/api/workspaces/:workspaceId/settings",
    requireAuth,
    settingsRouter
  );

  const clientDist = path.resolve(projectRoot, "client/dist");
  if (isProduction) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use("/api", (_req, _res, next) => next(notFound("API route not found")));
  app.use(errorHandler);

  return app;
}
