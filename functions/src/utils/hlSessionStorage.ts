import { SessionStorage } from "@gohighlevel/api-client";
import type { ISessionData } from "@gohighlevel/api-client/dist/lib/storage/interfaces";
import { db } from "./firestore";
import { encrypt, decrypt } from "./crypto";

const COLLECTION = "hlSessions";

/**
 * FirestoreSessionStorage stores HL OAuth sessions (keyed by locationId/companyId)
 * encrypted in Firestore. A separate index doc on users/{uid} maps the Firebase user
 * to their resourceId so hlProxy can look up tokens by UID.
 */
export class FirestoreSessionStorage extends SessionStorage {
  private clientId = "";

  setClientId(clientId: string): void {
    if (!clientId) throw new Error("clientId is required");
    this.clientId = clientId;
  }

  async init(): Promise<void> {
    // Firestore needs no explicit connection setup
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async createCollection(_collectionName: string): Promise<void> {
    // Firestore creates collections on write
  }

  async getCollection(_collectionName: string): Promise<any> {
    return db.collection(COLLECTION);
  }

  async setSession(resourceId: string, sessionData: ISessionData): Promise<void> {
    const payload = {
      ...sessionData,
      clientId: this.clientId,
      updatedAt: Date.now(),
    };
    await db
      .collection(COLLECTION)
      .doc(resourceId)
      .set({ data: encrypt(JSON.stringify(payload)) }, { merge: false });
  }

  async getSession(resourceId: string): Promise<ISessionData | null> {
    const doc = await db.collection(COLLECTION).doc(resourceId).get();
    if (!doc.exists) return null;
    try {
      return JSON.parse(decrypt(doc.data()!.data)) as ISessionData;
    } catch {
      return null;
    }
  }

  async deleteSession(resourceId: string): Promise<void> {
    await db.collection(COLLECTION).doc(resourceId).delete();
  }

  async getAccessToken(resourceId: string): Promise<string | null> {
    const session = await this.getSession(resourceId);
    return session?.access_token ?? null;
  }

  async getRefreshToken(resourceId: string): Promise<string | null> {
    const session = await this.getSession(resourceId);
    return session?.refresh_token ?? null;
  }
}

// ── helpers used by hlOAuth.ts and hlProxy.ts ────────────────────────────────

const storage = new FirestoreSessionStorage();

export function getSessionStorage(): FirestoreSessionStorage {
  return storage;
}

/**
 * Persist the locationId→UID mapping so hlProxy can resolve a token from a
 * Firebase UID without needing to scan all sessions.
 */
export async function linkUidToLocation(uid: string, locationId: string): Promise<void> {
  await db.collection("users").doc(uid).set({ hlLocationId: locationId }, { merge: true });
}

/**
 * Returns a live access token for the given Firebase UID, refreshing if needed.
 * Throws if the user has not connected HighLevel.
 */
export async function getAccessTokenForUid(uid: string): Promise<{ accessToken: string; locationId: string }> {
  const userDoc = await db.collection("users").doc(uid).get();
  const locationId: string = userDoc.data()?.hlLocationId;
  if (!locationId) throw new Error("HighLevel not connected");

  const session = await storage.getSession(locationId);
  if (!session?.access_token) throw new Error("HighLevel not connected");

  const now = Date.now();
  const expireAt: number = session.expire_at ?? 0;

  if (now < expireAt - 60_000) {
    return { accessToken: session.access_token, locationId };
  }

  // Token expired — refresh
  const refreshToken = session.refresh_token;
  if (!refreshToken) throw new Error("No refresh token stored");

  const res = await fetch("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.HL_CLIENT_ID!,
      client_secret: process.env.HL_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      user_type: "Location",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = (await res.json()) as ISessionData & { expires_in: number };

  const newSession: ISessionData = {
    ...session,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expire_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await storage.setSession(locationId, newSession);

  return { accessToken: data.access_token as string, locationId };
}
