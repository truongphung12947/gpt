"use client";

import { useAuiState } from "@assistant-ui/react";
import { useEffect, useState } from "react";

/** Preview URL for an image attachment: an object URL for a pending file, or the sent image content. */
export const useAttachmentSrc = (): string | undefined => {
  const { file, src } = useAuiState((s) => {
    const a = s.attachment;
    if (a.type !== "image") return {};
    if (a.file) return { file: a.file };
    const image = a.content?.find((c) => c.type === "image");
    return { src: image?.image };
  });

  const [objectUrl, setObjectUrl] = useState<string | undefined>();
  useEffect(() => {
    if (!file) {
      setObjectUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return objectUrl ?? src;
};
