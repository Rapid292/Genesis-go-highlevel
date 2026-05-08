import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firestore";
import { verifyUser } from "../utils/auth";

export const projectsApi = onRequest({ cors: true, invoker: "public" }, async (req, res) => {
  try {
    const uid = await verifyUser(req);

    // ── GET — list projects ────────────────────────────────────────────────
    if (req.method === "GET") {
      const snap = await db
        .collection("projects")
        .where("ownerId", "==", uid)
        .where("deleted", "==", false)
        .orderBy("createdAt", "desc")
        .get();

      res.json({
        projects: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
      return;
    }

    // ── POST — create project ──────────────────────────────────────────────
    if (req.method === "POST") {
      const { name, description = "" } = req.body as {
        name?: string;
        description?: string;
      };

      if (!name?.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const userDoc = await db.collection("users").doc(uid).get();
      const locationId: string = userDoc.data()?.hlLocationId ?? "";

      const ref = await db.collection("projects").add({
        name: name.trim(),
        description: description.trim(),
        ownerId: uid,
        locationId,
        files: {},
        fileCount: 0,
        totalSize: 0,
        deleted: false,
        generationLock: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ id: ref.id });
      return;
    }

    // ── PUT — update name / description ───────────────────────────────────
    if (req.method === "PUT") {
      const projectId = req.query.id as string;
      if (!projectId) {
        res.status(400).json({ error: "id query param required" });
        return;
      }

      const docRef = db.collection("projects").doc(projectId);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (doc.data()?.ownerId !== uid) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const { name, description } = req.body as {
        name?: string;
        description?: string;
      };

      const updates: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();

      await docRef.update(updates);
      res.json({ success: true });
      return;
    }

    // ── DELETE — soft delete ───────────────────────────────────────────────
    if (req.method === "DELETE") {
      const projectId = req.query.id as string;
      if (!projectId) {
        res.status(400).json({ error: "id query param required" });
        return;
      }

      const docRef = db.collection("projects").doc(projectId);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (doc.data()?.ownerId !== uid) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      await docRef.update({
        deleted: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message === "Unauthorized" ? 401 : 500;
    res.status(status).json({ error: message });
  }
});
