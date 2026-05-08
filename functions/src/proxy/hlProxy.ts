import { onRequest } from "firebase-functions/v2/https";
import { GHLError } from "@gohighlevel/api-client";
import { verifyUser } from "../utils/auth";
import { getAccessTokenForUid } from "../utils/hlSessionStorage";

const HL_BASE = "https://services.leadconnectorhq.com";
const ALLOWED_PATHS = /^\/(contacts|conversations|calendars)/;

export const hlProxy = onRequest(
  { cors: true, invoker: "public", secrets: ["ENCRYPTION_KEY", "HL_CLIENT_ID", "HL_CLIENT_SECRET"] },
  async (req, res) => {
    try {
      const uid = await verifyUser(req);

      const targetPath = (req.query.path as string) || "/";
      if (!ALLOWED_PATHS.test(targetPath)) {
        res.status(400).json({ error: "Path not allowed" });
        return;
      }

      const { accessToken, locationId } = await getAccessTokenForUid(uid);

      // Build forwarded URL — strip `path` from query params, keep the rest
      const forwardedParams = new URLSearchParams(req.query as Record<string, string>);
      forwardedParams.delete("path");

      // Inject locationId if not already present
      if (!forwardedParams.has("locationId")) {
        forwardedParams.set("locationId", locationId);
      }

      const targetUrl = `${HL_BASE}${targetPath}?${forwardedParams.toString()}`;

      const hlRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: ["POST", "PUT", "PATCH"].includes(req.method)
          ? JSON.stringify(req.body)
          : undefined,
      });

      const contentType = hlRes.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const data = isJson ? await hlRes.json() : await hlRes.text();

      res.status(hlRes.status);
      if (isJson) {
        res.json(data);
      } else {
        res.send(data);
      }
    } catch (err: unknown) {
      if (err instanceof GHLError) {
        const status = err.statusCode === 429 ? 429 : (err.statusCode ?? 500);
        const message =
          err.statusCode === 429
            ? "HighLevel rate limit reached. Please wait a moment and try again."
            : err.message;
        res.status(status).json({ error: message });
        return;
      }
      const message = err instanceof Error ? err.message : "Internal error";
      const status = message === "Unauthorized" ? 401 : message === "HighLevel not connected" ? 403 : 500;
      res.status(status).json({ error: message });
    }
  }
);
