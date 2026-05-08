import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { db } from "../utils/firestore";
import { verifyUser } from "../utils/auth";

export const snapshotsApi = onRequest({ cors: true, invoker: "public" }, async (req, res) => {
  try {
    const uid = await verifyUser(req);
    const projectId = req.query.projectId as string;

    if (!projectId) {
      res.status(400).json({ error: "projectId query param required" });
      return;
    }

    // Verify project ownership
    const projectRef = db.collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (projectDoc.data()?.ownerId !== uid) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // ── GET — list snapshots (without files payload) ───────────────────────
    if (req.method === "GET") {
      const snap = await projectRef
        .collection("snapshots")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const snapshots = snap.docs.map((d) => {
        const { files: _files, ...rest } = d.data();
        return { id: d.id, ...rest };
      });

      res.json({ snapshots });
      return;
    }

    // ── POST ?action=restore — restore snapshot ────────────────────────────
    if (req.method === "POST" && req.query.action === "restore") {
      const { snapshotId } = req.body as { snapshotId?: string };

      if (!snapshotId) {
        res.status(400).json({ error: "snapshotId is required" });
        return;
      }

      const snapDoc = await projectRef
        .collection("snapshots")
        .doc(snapshotId)
        .get();

      if (!snapDoc.exists) {
        res.status(404).json({ error: "Snapshot not found" });
        return;
      }

      const files = (snapDoc.data()?.files ?? {}) as Record<string, string>;
      const fileCount = Object.keys(files).length;
      const totalSize = Object.values(files).reduce(
        (sum, content) => sum + Buffer.byteLength(content, "utf8"),
        0
      );

      await projectRef.update({
        files,
        fileCount,
        totalSize,
        restoredFrom: snapshotId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, filesRestored: fileCount });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message === "Unauthorized" ? 401 : 500;
    res.status(status).json({ error: message });
  }
});
