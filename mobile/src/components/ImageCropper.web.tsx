// Interactive square cropper for the published web app.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { Button } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import type { ImageCropperProps } from './ImageCropper';

export function ImageCropper({ image, onCancel, onComplete }: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!pixels) return setError('Move the photo into position first.');
    setSaving(true);
    setError('');
    try {
      const blob = await cropImage(image, pixels);
      await onComplete(blob);
    } catch (e: any) {
      setError(e?.message ?? 'Could not crop this photo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <View style={styles.cropArea}>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, area) => setPixels(area)}
        />
      </View>
      <Text style={[font.muted, styles.help]}>Drag to position · pinch or use zoom</Text>
      <View style={styles.zoomRow}>
        <Pressable
          style={styles.zoomButton}
          onPress={() => setZoom((z) => Math.max(1, z - 0.2))}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
        <Text style={font.body} accessibilityLabel={`Zoom ${Math.round(zoom * 100)} percent`}>
          {Math.round(zoom * 100)}%
        </Text>
        <Pressable
          style={styles.zoomButton}
          onPress={() => setZoom((z) => Math.min(3, z + 0.2))}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Use this photo" loading={saving} onPress={save} />
      <Button title="Choose a different photo" variant="ghost" onPress={onCancel} />
    </View>
  );
}

async function cropImage(uri: string, crop: Area): Promise<Blob> {
  const image = await loadImage(uri);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image cropping is not supported by this browser.');
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 512, 512);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not process this photo.'));
    }, 'image/jpeg', 0.86);
  });
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read this photo.'));
    image.src = uri;
  });
}

const styles = StyleSheet.create({
  cropArea: {
    position: 'relative',
    width: '100%',
    height: 360,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: '#061E17',
  },
  help: { textAlign: 'center', marginTop: spacing(3) },
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(5), marginTop: spacing(2) },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { color: colors.text, fontSize: 28, lineHeight: 30 },
  error: { ...font.muted, color: colors.danger, textAlign: 'center', marginTop: spacing(3) },
});
