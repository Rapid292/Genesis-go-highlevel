import type { Request } from "firebase-functions/v2/https";
import { auth } from "./firestore";

export async function verifyUser(req: Request): Promise<string> {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.split("Bearer ")[1];
  const decoded = await auth.verifyIdToken(token);
  return decoded.uid;
}
