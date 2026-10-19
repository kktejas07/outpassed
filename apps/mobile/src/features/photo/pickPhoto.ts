import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/**
 * Lets the person take or choose a photo, crops it square and shrinks it to
 * 480 px, which keeps uploads around 40–80 KB. Returns base64 JPEG, or null
 * if they cancelled.
 */
export async function pickPhoto(source: "camera" | "library"): Promise<string | null> {
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Allow camera access in Settings to take a photo.");
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    cameraType: ImagePicker.CameraType.front,
  };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  // Centre-crop to a square in case the picker didn't (web has no crop step).
  const side = Math.min(asset.width || 480, asset.height || 480);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.height && asset.width !== asset.height) {
    ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: 480, height: 480 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.72, base64: true });
  if (!saved.base64) throw new Error("Couldn't read that photo. Try another one.");
  return saved.base64;
}

/** A screenshot or document photo (no square crop), shrunk to 1000 px wide. Returns base64 JPEG. */
export async function pickDocument(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if ((asset.width || 0) > 1000) ctx.resize({ width: 1000 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error("Couldn't read that image. Try another one.");
  return saved.base64;
}
