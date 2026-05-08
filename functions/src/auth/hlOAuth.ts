import { onRequest } from "firebase-functions/v2/https";
import { db } from "../utils/firestore";
import { getSessionStorage, linkUidToLocation } from "../utils/hlSessionStorage";
import type { ISessionData } from "@gohighlevel/api-client/dist/lib/storage/interfaces";

const HL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const HL_USERINFO_URL = "https://services.leadconnectorhq.com/oauth/userinfo";
const HL_AUTH_BASE = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const HL_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "conversations.readonly",
  "conversations.write",
  "calendars.readonly",
  "locations.readonly",
].join(" ");

export function getHLAuthUrl(uid: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.HL_CLIENT_ID!,
    redirect_uri: process.env.HL_REDIRECT_URI!,
    scope: HL_SCOPES,
    state: uid,
  });
  return `${HL_AUTH_BASE}?${params.toString()}`;
}

export const oauthCallback = onRequest(
  { invoker: "public", secrets: ["HL_CLIENT_ID", "HL_CLIENT_SECRET", "HL_REDIRECT_URI", "ENCRYPTION_KEY"] },
  async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
    const { code, state: uid } = req.query as Record<string, string>;

    if (!code || !uid) {
      res.redirect(`${frontendUrl}/dashboard?hl_error=missing_params`);
      return;
    }

    try {
      // Exchange authorization code for tokens
      const tokenRes = await fetch(HL_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.HL_CLIENT_ID!,
          client_secret: process.env.HL_CLIENT_SECRET!,
          grant_type: "authorization_code",
          code,
          redirect_uri: process.env.HL_REDIRECT_URI!,
          user_type: "Location",
        }),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed: ${tokenRes.status}`);
      }

      const tokenData = (await tokenRes.json()) as ISessionData & {
        expires_in: number;
        locationId?: string;
      };

      if (!tokenData.access_token) throw new Error("No access token in response");

      // Fetch location info for display name
      const userInfoRes = await fetch(HL_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Version: "2021-07-28",
        },
      });
      const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

      const locationId: string =
        tokenData.locationId || userInfo.locationId || userInfo.activeLocation || "";
      const locationName: string =
        userInfo.companyName || userInfo.name || "Connected Location";

      if (!locationId) throw new Error("Could not determine locationId from HL response");

      // Store encrypted session keyed by locationId
      const storage = getSessionStorage();
      storage.setClientId(process.env.HL_CLIENT_ID!);

      const sessionData: ISessionData = {
        access_token: tokenData.access_token as string,
        refresh_token: tokenData.refresh_token as string,
        token_type: tokenData.token_type ?? "Bearer",
        scope: tokenData.scope ?? HL_SCOPES,
        locationId,
        userId: tokenData.userId as string | undefined,
        companyId: tokenData.companyId as string | undefined,
        expire_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      };

      await storage.setSession(locationId, sessionData);

      // Store locationId + display info on the Firebase user doc
      await db.collection("users").doc(uid).set(
        {
          hlLocationId: locationId,
          hlLocationName: locationName,
        },
        { merge: true }
      );

      // Create the UID → locationId mapping for proxy lookups
      await linkUidToLocation(uid, locationId);

      res.redirect(`${frontendUrl}/dashboard?hl_connected=true`);
    } catch (err) {
      console.error("HL OAuth error:", err);
      res.redirect(`${frontendUrl}/dashboard?hl_error=true`);
    }
  }
);

export async function refreshHLToken(uid: string): Promise<string> {
  const userDoc = await db.collection("users").doc(uid).get();
  const locationId: string = userDoc.data()?.hlLocationId;
  if (!locationId) throw new Error("No HL location linked to this user");

  const storage = getSessionStorage();
  const session = await storage.getSession(locationId);
  if (!session?.refresh_token) throw new Error("No refresh token stored");

  const res = await fetch(HL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.HL_CLIENT_ID!,
      client_secret: process.env.HL_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: session.refresh_token,
      user_type: "Location",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = (await res.json()) as ISessionData & { expires_in: number };

  const updated: ISessionData = {
    ...session,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? session.refresh_token,
    expire_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await storage.setSession(locationId, updated);
  return data.access_token as string;
}
