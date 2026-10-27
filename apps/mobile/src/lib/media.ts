import { signedMediaUrl, uuid, type MediaRef } from "@moving/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

const MAX_SIZE = 1280;

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, "media");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Resizes, compresses and copies a picked/captured image into the app's document folder. */
async function persistImage(asset: ImagePicker.ImagePickerAsset): Promise<MediaRef> {
  const id = uuid();
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width || 0, asset.height || 0);
  if (longest > MAX_SIZE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_SIZE } : { height: MAX_SIZE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
  const dest = new File(mediaDir(), `${id}.jpg`);
  new File(saved.uri).copySync(dest);
  return { id, uri: dest.uri, mime: "image/jpeg", name: asset.fileName ?? `${id}.jpg` };
}

export async function takePhoto(): Promise<MediaRef | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Camera access needed", "Allow camera access in Settings to photograph your belongings.");
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85 });
  if (res.canceled || !res.assets[0]) return null;
  return persistImage(res.assets[0]);
}

export async function pickPhotos(multiple = true): Promise<MediaRef[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85, allowsMultipleSelection: multiple, selectionLimit: multiple ? 10 : 1 });
  if (res.canceled) return [];
  return Promise.all(res.assets.map(persistImage));
}

/** Local file URIs embed the app container path, which can change between installs; re-resolve by filename. */
export function localUri(ref: MediaRef): string | null {
  if (!ref.uri) return null;
  if (!ref.uri.startsWith("file:")) return ref.uri;
  const name = ref.uri.split("/").pop()!;
  const f = new File(Paths.document, "media", name);
  return f.exists ? f.uri : null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function readMedia(ref: MediaRef): Promise<ArrayBuffer> {
  const uri = localUri(ref);
  if (!uri) throw new Error("No local media to upload");
  if (uri.startsWith("data:")) {
    const bytes = base64ToBytes(uri.slice(uri.indexOf(",") + 1));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const bytes = await new File(uri).bytes();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function deleteLocalMedia(ref: MediaRef) {
  const uri = localUri(ref);
  if (uri?.startsWith("file:")) {
    try {
      new File(uri).delete();
    } catch {
      /* already gone */
    }
  }
}

const signedCache = new Map<string, { url: string; at: number }>();

/** Returns something <Image> can display: the local file, or a signed URL for media uploaded by another device. */
export function useMediaUri(ref: MediaRef | undefined, supabase: SupabaseClient | null): string | null {
  const local = ref ? localUri(ref) : null;
  const remotePath = ref?.remotePath ?? null;
  const cached = remotePath ? signedCache.get(remotePath) : undefined;
  const [now] = useState(() => Date.now());
  const fresh = cached && now - cached.at < 50 * 60 * 1000 ? cached.url : null;
  const [remote, setRemote] = useState<string | null>(fresh);

  useEffect(() => {
    if (local || !remotePath || !supabase || fresh) return;
    let alive = true;
    void signedMediaUrl(supabase, remotePath).then((url) => {
      if (!url) return;
      signedCache.set(remotePath, { url, at: Date.now() });
      if (alive) setRemote(url);
    });
    return () => {
      alive = false;
    };
  }, [local, remotePath, supabase, fresh]);

  return local ?? fresh ?? remote;
}
