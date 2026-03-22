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
/**
 * Upload a file (local path or URL) to Weixin CDN.
 * Returns UploadedMedia with all params needed for sendMessage.
 */
export declare function uploadMedia(params: {
    source: string;
    mediaType: MediaType;
    toUserId: string;
    token: string;
    baseUrl: string;
}): Promise<UploadedMedia>;
