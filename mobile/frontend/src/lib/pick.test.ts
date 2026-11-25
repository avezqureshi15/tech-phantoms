import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { PermissionDenied, PickFailed, pickFile } from "@/lib/pick";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const documents = jest.mocked(DocumentPicker);
const images = jest.mocked(ImagePicker);

beforeEach(() => jest.clearAllMocks());

describe("pickFile", () => {
  it("returns the chosen file, with a sensible type when the phone gives none", async () => {
    documents.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///a.pdf", name: "a.pdf", mimeType: undefined }],
    } as never);

    expect(await pickFile("file")).toEqual({ uri: "file:///a.pdf", name: "a.pdf", type: "application/pdf" });
  });

  it("returns null when the person backs out", async () => {
    documents.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    images.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
    images.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);

    expect(await pickFile("file")).toBeNull();
    expect(await pickFile("library")).toBeNull();
  });

  it("names a photo and keeps its type", async () => {
    images.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
    images.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///p.jpg", fileName: null, mimeType: "image/jpeg" }],
    } as never);

    expect(await pickFile("camera")).toEqual({ uri: "file:///p.jpg", name: "photo.jpg", type: "image/jpeg" });
  });

  it("reports a refused permission distinctly, and never opens the camera without it", async () => {
    images.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as never);

    await expect(pickFile("camera")).rejects.toBeInstanceOf(PermissionDenied);
    expect(images.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("turns any other native failure into one friendly error instead of an uncaught one", async () => {
    documents.getDocumentAsync.mockRejectedValue(new Error("Calling the 'getDocumentAsync' function has failed"));

    await expect(pickFile("file")).rejects.toBeInstanceOf(PickFailed);
    await expect(pickFile("file")).rejects.toThrow(/choosing a photo/);
  });
});
