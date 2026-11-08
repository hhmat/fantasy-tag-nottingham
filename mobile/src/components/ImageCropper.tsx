// Native picking uses the operating system's square cropper, so this component
// is intentionally web-only. The .web.tsx implementation is bundled on web.
import React from 'react';

export type ImageCropperProps = {
  image: string;
  onCancel: () => void;
  onComplete: (image: Blob) => Promise<void>;
};

export function ImageCropper(_props: ImageCropperProps) {
  return null;
}
