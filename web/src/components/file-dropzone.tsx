"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/pt-BR";
import { cn, formatBytes } from "@/lib/utils";
import type { UIFile } from "@/app/(app)/c/[id]/conversation-view";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Exhaustive allow-list per PRD §12.3 + PRD §27 Q2 default.
// NOTE: `application/zip` covers .zip, plus a few aliases that browsers emit.
const ACCEPTED_MIME = new Set([
  "application/xml",
  "text/xml",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
]);

const ACCEPT_ATTR = ".xml,.pdf,.jpg,.jpeg,.png,.zip,application/xml,text/xml,application/pdf,image/jpeg,image/png,application/zip";

interface Props {
  conversationId: string;
  onUploadedAction: (f: UIFile) => void;
}

export function FileDropzone({ conversationId, onUploadedAction }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  async function uploadOne(file: File) {
    // 1. Validate client-side.
    if (file.size > MAX_FILE_BYTES) {
      setError(t.files.tooLarge);
      return;
    }
    const effectiveMime = file.type || guessMimeFromName(file.name);
    if (!ACCEPTED_MIME.has(effectiveMime)) {
      setError(t.files.unsupported);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      // 2. Ask server for a presigned PUT URL and a pre-created attachment row.
      const presignRes = await fetch(
        `/api/conversations/${conversationId}/files`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            original_name: file.name,
            mime_type: effectiveMime,
            size_bytes: file.size,
          }),
        },
      );
      if (!presignRes.ok) throw new Error(await presignRes.text());
      const presign: {
        attachment_id: string;
        upload_url: string;
        storage_key: string;
      } = await presignRes.json();

      // 3. Optimistically show it in the panel, not yet complete.
      onUploadedAction({
        id: presign.attachment_id,
        name: file.name,
        mimeType: effectiveMime,
        sizeBytes: file.size,
        uploadComplete: false,
      });

      // 4. PUT bytes directly to MinIO.
      const putRes = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "content-type": effectiveMime },
        body: file,
      });
      if (!putRes.ok) throw new Error(`put ${putRes.status}`);

      // 5. Confirm completion server-side.
      const confirmRes = await fetch(
        `/api/conversations/${conversationId}/files/${presign.attachment_id}/complete`,
        { method: "POST" },
      );
      if (!confirmRes.ok) throw new Error(await confirmRes.text());

      // Replace optimistic entry with complete one.
      onUploadedAction({
        id: presign.attachment_id,
        name: file.name,
        mimeType: effectiveMime,
        sizeBytes: file.size,
        uploadComplete: true,
      });
    } catch (e) {
      console.error("upload failed", e);
      setError(t.files.uploadError);
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    startTransition(async () => {
      for (const f of Array.from(files)) {
        await uploadOne(f);
      }
    });
  }

  return (
    <div>
      <div
        className={cn(
          "rounded-md border border-dashed p-3 text-center text-xs cursor-pointer transition-colors",
          dragging ? "bg-accent" : "hover:bg-accent/40",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
        <p>{t.files.dragDrop}</p>
        <p className="text-muted-foreground mt-1">{t.files.supported}</p>
        <p className="text-muted-foreground">
          {t.files.maxSize} ({formatBytes(MAX_FILE_BYTES)})
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading && (
        <p className="mt-2 text-xs text-muted-foreground">{t.files.uploading}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        onClick={() => inputRef.current?.click()}
      >
        {t.composer.attach}
      </Button>
    </div>
  );
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}
