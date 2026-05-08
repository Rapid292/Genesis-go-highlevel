import { onRequest } from "firebase-functions/v2/https";
import OpenAI from "openai";
import * as admin from "firebase-admin";
import { db } from "../utils/firestore";
import { verifyUser } from "../utils/auth";
import { buildSystemPrompt, detectAPIsUsed } from "./promptBuilder";
import { parseFilesFromLLMOutput, validateFiles } from "./fileParser";

process.env.REQUESTY_API_KEY ||= "firebase-cli-analysis-placeholder";

const llmClient = new OpenAI({
  apiKey: process.env.REQUESTY_API_KEY || "",
  baseURL: "https://router.requesty.ai/v1",
});

function sendEvent(
  res: { write: (chunk: string) => void },
  event: string,
  data: Record<string, unknown>
) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const generateApp = onRequest(
  {
    cors: true,
    invoker: "public",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: [],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }

    // SSE headers must be set before any write
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if present

    let projectRef: admin.firestore.DocumentReference | null = null;

    try {
      const uid = await verifyUser(req);

      const {
        projectId,
        prompt,
        chatHistory = [],
      } = req.body as {
        projectId: string;
        prompt: string;
        chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
      };

      if (!projectId || !prompt?.trim()) {
        sendEvent(res, "error", { code: "BAD_REQUEST", message: "projectId and prompt are required" });
        res.end();
        return;
      }

      projectRef = db.collection("projects").doc(projectId);
      const projectDoc = await projectRef.get();
      const projectData = projectDoc.data();

      if (!projectDoc.exists || !projectData) {
        sendEvent(res, "error", { code: "NOT_FOUND", message: "Project not found" });
        res.end();
        return;
      }
      if (projectData.ownerId !== uid) {
        sendEvent(res, "error", { code: "FORBIDDEN", message: "Access denied" });
        res.end();
        return;
      }

      // Acquire generation lock atomically
      const locked = await db.runTransaction(async (t) => {
        const doc = await t.get(projectRef!);
        if (doc.data()?.generationLock === true) return false;
        t.update(projectRef!, { generationLock: true });
        return true;
      });

      if (!locked) {
        sendEvent(res, "error", { code: "LOCKED", message: "Generation already in progress for this project" });
        res.end();
        return;
      }

      try {
        const existingFiles = (projectData.files ?? {}) as Record<string, string>;
        const systemPrompt = buildSystemPrompt(existingFiles);
        let fullOutput = "";

        const model = process.env.LLM_MODEL || "deepseek/deepseek-v4-flash";

        const stream = await llmClient.chat.completions.create({
          model,
          max_tokens: 8192,
          stream: true,
          temperature: 1.0,
          messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory.slice(-6).map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user", content: prompt },
          ],
        });

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || "";

          if (text) {
            fullOutput += text;
            sendEvent(res, "token", { chunk: text });
          }
        }

        // Parse and validate generated files
        const parsedFiles = parseFilesFromLLMOutput(fullOutput);
        const apisUsed = detectAPIsUsed(fullOutput);

        sendEvent(res, "apis_used", { apis: apisUsed });

        if (parsedFiles.length === 0) {
          sendEvent(res, "error", { code: "NO_FILES", message: "AI generated no file changes. Try rephrasing your prompt." });
          res.end();
          return;
        }

        // Guardrail validation
        const existingCount = Object.keys(existingFiles).length;
        const existingSize = Object.values(existingFiles).reduce(
          (sum, c) => sum + Buffer.byteLength(c, "utf8"),
          0
        );
        const validation = validateFiles(parsedFiles, existingCount, existingSize);

        if (!validation.valid) {
          sendEvent(res, "error", { code: "LIMIT_EXCEEDED", message: validation.error! });
          res.end();
          return;
        }

        // Iterative refinement: merge new files into existing set
        const updatedFiles = { ...existingFiles };
        for (const f of parsedFiles) {
          updatedFiles[f.name] = f.content;
          sendEvent(res, "file_end", { filename: f.name });
        }

        const newTotalSize = Object.values(updatedFiles).reduce(
          (sum, c) => sum + Buffer.byteLength(c, "utf8"),
          0
        );

        // Persist updated files
        await projectRef.update({
          files: updatedFiles,
          fileCount: Object.keys(updatedFiles).length,
          totalSize: newTotalSize,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create snapshot (point-in-time copy)
        const snapshotRef = await projectRef.collection("snapshots").add({
          prompt,
          files: updatedFiles,
          apisUsed,
          filesChanged: parsedFiles.length,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Persist assistant message for chat history continuity
        await projectRef.collection("messages").add({
          role: "assistant",
          content: `Generated ${parsedFiles.length} file(s). APIs used: ${apisUsed.join(", ") || "none"}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        sendEvent(res, "done", {
          snapshotId: snapshotRef.id,
          filesChanged: parsedFiles.length,
          apisUsed,
        });
      } finally {
        // Always release lock, even on error
        if (projectRef) {
          await projectRef.update({ generationLock: false }).catch((e) =>
            console.error("Failed to release generation lock:", e)
          );
        }
      }
    } catch (err: unknown) {
      console.error("generateApp error:", err);
      const message = err instanceof Error ? err.message : "Internal error";
      sendEvent(res, "error", { code: "INTERNAL", message });

      // Best-effort lock release
      if (projectRef) {
        await projectRef.update({ generationLock: false }).catch(() => null);
      }
    }

    res.end();
  }
);
