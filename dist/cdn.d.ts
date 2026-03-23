/**
 * CDN upload utilities for image/video/file sending.
 * Based on @tencent-weixin/openclaw-weixin official implementation.
 */
export type MediaType = "image" | "video" | "file";
export interface UploadedMedia {
    filekey: string;
    downloadEncryptedQueryParam: string;
    aeskey: string;
    fileSize: number;
    fileSizeCiphertext: number;
    fileName?: string;
}
export interface DownloadParams {
    encryptQueryParam: string;
    aesKey: string;
}
/**
 * Download and decrypt a media file from Weixin CDN.
 * Returns the decrypted plaintext Buffer.
 */
export declare function downloadMedia(params: DownloadParams): Promise<Buffer>;
/**
 * Download media to a local file.
 */
export declare function downloadMediaToFile(params: DownloadParams, outputPath: string): Promise<void>;
export declare function uploadMedia(params: {
    source: string;
    mediaType: MediaType;
    toUserId: string;
    token: string;
    baseUrl: string;
}): Promise<UploadedMedia>;
