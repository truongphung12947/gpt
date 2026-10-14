import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";

/** PDFs, Word files and images, per file. Files travel as base64 (a third larger) inside the chat request. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/**
 * Plain text costs about one token per four bytes, so a 4 MB text file filled 94% of the
 * model's context window in testing (and is resent every turn). Keep it far smaller.
 */
export const MAX_TEXT_BYTES = 1 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json"]);

// What the model service reads natively when a file is attached to a message.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const resolveMime = (file: File) =>
  file.type && file.type !== "application/octet-stream"
    ? file.type
    : (MIME_BY_EXTENSION[extensionOf(file.name)] ?? file.type);

const isSupported = (file: File) => {
  const mime = resolveMime(file);
  return (
    Object.values(MIME_BY_EXTENSION).includes(mime) ||
    mime in { "text/x-markdown": 1, "application/csv": 1 }
  );
};

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const readDataUrl = (file: File, signal?: AbortSignal) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(new DOMException("Attachment read aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.onload = () => {
      signal?.removeEventListener("abort", abort);
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Attaches the file itself to the message (base64); the model service extracts the text
 * and, for PDFs and images, looks at the pages. Rejected files stay in the composer with
 * an error message, so the user sees why, and must be removed before sending.
 */
export const fileAttachmentAdapter: AttachmentAdapter = {
  accept: [
    "image/png,image/jpeg,image/gif,image/webp",
    "application/pdf,text/plain,text/markdown,text/csv,application/json",
    ".pdf,.txt,.md,.csv,.json,.docx",
  ].join(","),

  async add({ file }) {
    const isImage = resolveMime(file).startsWith("image/");
    const base = {
      id: crypto.randomUUID(),
      type: isImage ? "image" : "document",
      name: file.name,
      contentType: resolveMime(file),
      file,
    } as const;

    let error: string | undefined;
    if (!isSupported(file)) {
      error = "Unsupported file type";
    } else {
      const isText = TEXT_EXTENSIONS.has(extensionOf(file.name)) || resolveMime(file).startsWith("text/");
      const limit = isText ? MAX_TEXT_BYTES : MAX_FILE_BYTES;
      if (file.size > limit) {
        error = `Too large (${formatMb(file.size)}, max ${formatMb(limit)})`;
      }
    }

    return {
      ...base,
      status: error
        ? { type: "incomplete", reason: "error", message: error }
        : { type: "requires-action", reason: "composer-send" },
    } satisfies PendingAttachment;
  },

  async send(attachment, options): Promise<CompleteAttachment> {
    if (attachment.status.type === "incomplete") {
      throw new Error(attachment.status.message ?? "This file can't be attached");
    }
    const dataUrl = await readDataUrl(attachment.file, options?.signal);
    const mimeType = attachment.contentType ?? resolveMime(attachment.file);
    return {
      ...attachment,
      status: { type: "complete" },
      content:
        attachment.type === "image"
          ? [{ type: "image", image: dataUrl }]
          : [{ type: "file", filename: attachment.name, data: dataUrl, mimeType }],
    };
  },

  async remove() {},
};
