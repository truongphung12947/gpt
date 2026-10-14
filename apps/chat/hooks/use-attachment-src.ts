"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useState } from "react";

/** Preview URL for an image attachment: an object URL for a pending file, or the sent image content. */
export const useAttachmentSrc = (): string | undefined => {
  // Select plain values: a selector that returns a fresh object each call re-renders forever.
  const file = useAuiState((s) =>
    s.attachment.type === "image" ? s.attachment.file : undefined,
  );
  const src = useAuiState((s) => {
    const a = s.attachment;
    if (a.type !== "image" || a.file) return undefined;
    return a.content?.find((c) => c.type === "image")?.image;
  });

  const [objectUrl, setObjectUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Syncing with an external resource (the browser's blob URL registry).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(undefined);
    };
  }, [file]);

  return objectUrl ?? src;
};
