import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ApiError } from "../../shared/types";
import { requireAuth, requireShop } from "./auth";
import { createDb } from "./db";
import type { AppEnv } from "./env";
import { ApiHttpError } from "./errors";
import accountRoutes from "./routes/account";
import aiRoutes from "./routes/ai";
import clientRoutes from "./routes/clients";
import fittingRoutes from "./routes/fittings";
import homeRoutes from "./routes/home";
import messageRoutes from "./routes/messages";
import orderRoutes, { shopOrderRoutes } from "./routes/orders";
import publicRoutes from "./routes/public";
import shopRoutes from "./routes/shop";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 86400,
  }),
);

// Public: GET /health, GET /privacy, GET /support (registered before auth so they bypass it).
app.route("/", publicRoutes);

// Everything below requires a Clerk session token.
app.use("*", requireAuth);
app.use("*", async (c, next) => {
  c.set("db", createDb(c.env));
  await next();
});

app.route("/shop", shopRoutes);
app.route("/account", accountRoutes);

// These need an onboarded shop (PUT /shop done).
app.use("/home", requireShop);
app.use("/clients", requireShop);
app.use("/clients/*", requireShop);
app.use("/orders", requireShop);
app.use("/orders/*", requireShop);
app.use("/ai/*", requireShop);

app.route("/home", homeRoutes);
app.route("/clients", clientRoutes);
app.route("/clients", fittingRoutes); // /clients/:clientId/fittings
app.route("/clients", orderRoutes); // /clients/:clientId/orders[/:orderId]
app.route("/clients", messageRoutes); // /clients/:clientId/messages
app.route("/orders", shopOrderRoutes); // shop-wide list
app.route("/ai", aiRoutes);

app.notFound((c) => {
  const body: ApiError = { error: { code: "not_found", message: "Route not found." } };
  return c.json(body, 404);
});

app.onError((err, c) => {
  if (err instanceof ApiHttpError) {
    return c.json(err.toBody(), err.status);
  }
  if (err instanceof HTTPException) {
    const code = err.status === 401 ? "unauthorized" : err.status === 404 ? "not_found" : err.status < 500 ? "bad_request" : "server_error";
    const body: ApiError = { error: { code, message: err.message || "Request failed." } };
    return c.json(body, err.status);
  }
  console.error("[unhandled]", err);
  const body: ApiError = { error: { code: "server_error", message: "Something went wrong. Please try again." } };
  return c.json(body, 500);
});

export default app;
