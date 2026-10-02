"use strict";
// TLS mobile API contract — shared by mobile/app and mobile/api.
// Every route except /privacy and /support requires `Authorization: Bearer <Clerk session token>`.
// Errors always come back as ApiError with a non-2xx status.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_STATUSES = exports.GARMENT_TYPES = void 0;
/** DELETE /clients/:id → 204 (also deletes its fittings) */
// ---------- Fittings (manual measurements, cm) ----------
/** Which measurement set a fitting uses. "suit" = jacket + trousers fields. */
exports.GARMENT_TYPES = ["jacket", "trousers", "shirt", "suit"];
// ---------- Orders (a garment for a client, moving through the workshop) ----------
/** In workflow sequence. The app shows them as a stepper in this order. */
exports.ORDER_STATUSES = ["measured", "cutting", "fitting", "ready", "delivered"];
// ---------- Account ----------
/** DELETE /account → 204. Deletes the shop, all its data and the Clerk user. */
