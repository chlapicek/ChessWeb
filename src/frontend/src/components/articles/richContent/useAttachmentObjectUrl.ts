import { useEffect, useState } from 'react';
import { fetchAttachmentBlob } from '../articleUtils';

// Attachments are fetched with the bearer token because unattached draft uploads are only visible to their uploader.
export const useAttachmentObjectUrl = (attachmentId: string | undefined) => {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({ failed: false });

  useEffect(() => {
    if (!attachmentId) {
      setState({ failed: true });
      return;
    }
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ failed: false });
    fetchAttachmentBlob(attachmentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, failed: false });
      })
      .catch(() => { if (!cancelled) setState({ failed: true }); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  return state;
};
