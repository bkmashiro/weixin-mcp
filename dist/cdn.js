/**
 * CDN upload utilities for image/video/file sending.
 * Based on @tencent-weixin/openclaw-weixin official implementation.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
// ── AES-128-ECB ────────────────────────────────────────────────────────────
function encryptAesEcb(plaintext, key) {
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function aesEcbPaddedSize(plaintextSize) {
    return Math.ceil((plaintextSize + 1) / 16) * 16;
}
const MEDIA_TYPE_MAP = {
    image: 1,
    video: 2,
    file: 3,
};
// ── API calls ──────────────────────────────────────────────────────────────
function randomWechatUin() {
    return crypto.randomBytes(4).toString("base64");
}
async function getUploadUrl(params) {
    const body = JSON.stringify({
        filekey: params.filekey,
        media_type: params.mediaType,
        to_user_id: params.toUserId,
        rawsize: params.rawsize,
        rawfilemd5: params.rawfilemd5,
        filesize: params.filesize,
        no_need_thumb: true,
        aeskey: params.aeskey,
        base_info: { channel_version: "1.0.2" },
    });
    const res = await fetch(`${params.baseUrl}/ilink/bot/getuploadurl`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": String(Buffer.byteLength(body, "utf-8")),
            "AuthorizationType": "ilink_bot_token",
            "Authorization": `Bearer ${params.token}`,
            "X-WECHAT-UIN": randomWechatUin(),
        },
        body,
    });
    return res.json();
}
async function uploadToCdn(params) {
    const ciphertext = encryptAesEcb(params.buf, params.aeskey);
    const cdnUrl = `${CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(params.uploadParam)}&filekey=${encodeURIComponent(params.filekey)}`;
    const res = await fetch(cdnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
    });
    if (!res.ok) {
        const errMsg = res.headers.get("x-error-message") ?? `status ${res.status}`;
        throw new Error(`CDN upload failed: ${errMsg}`);
    }
    const downloadParam = res.headers.get("x-encrypted-param");
    if (!downloadParam) {
        throw new Error("CDN response missing x-encrypted-param header");
    }
    return downloadParam;
}
// ── Main upload function ───────────────────────────────────────────────────
/**
 * Upload a file (local path or URL) to Weixin CDN.
 * Returns UploadedMedia with all params needed for sendMessage.
 */
// ── AES-128-ECB Decryption ─────────────────────────────────────────────────
function decryptAesEcb(ciphertext, key) {
    const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
/**
 * Download and decrypt a media file from Weixin CDN.
 * Returns the decrypted plaintext Buffer.
 */
export async function downloadMedia(params) {
    const { encryptQueryParam, aesKey } = params;
    // Build download URL
    const cdnUrl = `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
    const res = await fetch(cdnUrl, {
        method: "GET",
        headers: {
            "Accept": "*/*",
        },
    });
    if (!res.ok) {
        const errMsg = res.headers.get("x-error-message") ?? `status ${res.status}`;
        throw new Error(`CDN download failed: ${errMsg}`);
    }
    const ciphertext = Buffer.from(await res.arrayBuffer());
    // Decrypt
    const keyBuffer = Buffer.from(aesKey, "hex");
    const plaintext = decryptAesEcb(ciphertext, keyBuffer);
    return plaintext;
}
/**
 * Download media to a local file.
 */
export async function downloadMediaToFile(params, outputPath) {
    const data = await downloadMedia(params);
    await fs.writeFile(outputPath, data);
}
// ── Main upload function ───────────────────────────────────────────────────
export async function uploadMedia(params) {
    const { source, mediaType, toUserId, token, baseUrl } = params;
    // Load file
    let plaintext;
    let fileName;
    if (source.startsWith("http://") || source.startsWith("https://")) {
        // Download remote file
        const res = await fetch(source);
        if (!res.ok)
            throw new Error(`Failed to download: ${source}`);
        plaintext = Buffer.from(await res.arrayBuffer());
        // Extract filename from URL
        const urlPath = new URL(source).pathname;
        fileName = path.basename(urlPath);
    }
    else {
        // Read local file
        plaintext = await fs.readFile(source);
        fileName = path.basename(source);
    }
    // Generate keys and hashes
    const rawsize = plaintext.length;
    const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
    const filesize = aesEcbPaddedSize(rawsize);
    const filekey = crypto.randomBytes(16).toString("hex");
    const aeskey = crypto.randomBytes(16);
    // Get upload URL
    const uploadResp = await getUploadUrl({
        filekey,
        mediaType: MEDIA_TYPE_MAP[mediaType],
        toUserId,
        rawsize,
        rawfilemd5,
        filesize,
        aeskey: aeskey.toString("hex"),
        token,
        baseUrl,
    });
    if (!uploadResp.upload_param) {
        throw new Error(`getUploadUrl returned no upload_param: ${JSON.stringify(uploadResp)}`);
    }
    // Upload to CDN
    const downloadEncryptedQueryParam = await uploadToCdn({
        buf: plaintext,
        uploadParam: uploadResp.upload_param,
        filekey,
        aeskey,
    });
    return {
        filekey,
        downloadEncryptedQueryParam,
        aeskey: aeskey.toString("hex"),
        fileSize: rawsize,
        fileSizeCiphertext: filesize,
        fileName,
    };
}
