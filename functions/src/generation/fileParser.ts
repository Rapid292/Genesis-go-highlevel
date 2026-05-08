export interface ParsedFile {
  name: string;
  content: string;
}

// Matches <file name="...">...</file> — greedy-safe with [\s\S]*?
const FILE_REGEX = /<file name="([^"]+)">([\s\S]*?)<\/file>/g;

export function parseFilesFromLLMOutput(output: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  FILE_REGEX.lastIndex = 0; // reset in case of reuse
  let match: RegExpExecArray | null;
  while ((match = FILE_REGEX.exec(output)) !== null) {
    const name = match[1].trim();
    const content = match[2].trim();
    if (name && content) files.push({ name, content });
  }
  return files;
}

const MAX_FILES = 100;
const MAX_FILE_SIZE = 200 * 1024; // 200 KB
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10 MB

export function validateFiles(
  newFiles: ParsedFile[],
  existingCount: number,
  existingSize: number
): { valid: boolean; error?: string } {
  if (existingCount + newFiles.length > MAX_FILES) {
    return { valid: false, error: `Exceeds max file limit of ${MAX_FILES}` };
  }

  let addedSize = 0;
  for (const f of newFiles) {
    const size = Buffer.byteLength(f.content, "utf8");
    if (size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File "${f.name}" exceeds the 200 KB per-file limit (${Math.round(size / 1024)} KB)`,
      };
    }
    addedSize += size;
  }

  if (existingSize + addedSize > MAX_TOTAL_SIZE) {
    return { valid: false, error: "Project exceeds the 10 MB total size limit" };
  }

  return { valid: true };
}
