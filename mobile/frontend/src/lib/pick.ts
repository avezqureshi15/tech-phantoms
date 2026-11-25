import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

export type PickSource = "camera" | "library" | "file";
export type PickedFile = { uri: string; name: string; type: string };

export class PermissionDenied extends Error {
  constructor() {
    super("Allow access in Settings to use this, or pick a file instead.");
    this.name = "PermissionDenied";
  }
}

/** The picker itself failed (for example the Files app is unavailable), as opposed to a refusal. */
export class PickFailed extends Error {
  constructor() {
    super("Couldn't open that. Try choosing a photo instead.");
    this.name = "PickFailed";
  }
}

/** Receipts and documents: photos or PDFs. */
const FILE_TYPES = ["application/pdf", "image/*"];

/**
 * Picks one photo or file for reading. Returns null when the person backs out; throws
 * `PermissionDenied` when the camera or photo library was refused.
 */
export async function pickFile(source: PickSource): Promise<PickedFile | null> {
  try {
    return await choose(source);
  } catch (error) {
    if (error instanceof PermissionDenied) throw error;
    throw new PickFailed(); // a native picker can fail for reasons the person cannot see; never crash on it
  }
}

async function choose(source: PickSource): Promise<PickedFile | null> {
  if (source === "file") {
    const result = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return null;
    return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/pdf" };
  }

  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied();

  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return { uri: asset.uri, name: asset.fileName ?? "photo.jpg", type: asset.mimeType ?? "image/jpeg" };
}
