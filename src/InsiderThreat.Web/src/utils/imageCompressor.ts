/**
 * Client-side image compression utility
 * Uses Canvas API to resize and compress images before upload
 * This dramatically reduces file size (e.g., 10MB iPhone photo → ~300KB)
 */

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const JPEG_QUALITY = 0.7;
const MAX_FILE_SIZE_MB = 50; // Max allowed file size in MB (for videos)

/**
 * Compress an image file using Canvas API
 * - Resizes to max 1920x1920 (preserving aspect ratio)
 * - Converts to JPEG at 70% quality
 * - Returns a new compressed File object
 */
export async function compressImage(file: File): Promise<File> {
    // Only compress image files
    if (!file.type.startsWith('image/')) {
        return file;
    }

    // Skip GIFs (animated) and SVGs (vector)
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return file;
    }

    // If already small enough (< 500KB), skip compression
    if (file.size < 500 * 1024) {
        return file;
    }

    return new Promise((resolve) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            resolve(file); // Fallback to original
            return;
        }

        // Load the image from file
        const url = URL.createObjectURL(file);
        img.src = url;

        img.onload = () => {
            URL.revokeObjectURL(url);

            let width = img.width;
            let height = img.height;

            // Calculate new dimensions (maintain aspect ratio)
            if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (!blob || blob.size >= file.size) {
                        resolve(file); // Fallback to original if compression didn't help
                        return;
                    }

                    // Create new file with compressed data
                    const compressedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg', lastModified: Date.now() }
                    );

                    console.log(
                        `[ImageCompressor] ${file.name}: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
                    );

                    resolve(compressedFile);
                },
                'image/jpeg',
                JPEG_QUALITY
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            console.warn('[ImageCompressor] Failed to load image, using original');
            resolve(file); // Fallback to original
        };
    });
}

/**
 * Validate file size (mainly for videos)
 * Returns error message if too large, null if OK
 */
export function validateFileSize(file: File): string | null {
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > MAX_FILE_SIZE_MB) {
        return `File quá lớn (${sizeMB.toFixed(1)}MB). Giới hạn tối đa là ${MAX_FILE_SIZE_MB}MB.`;
    }
    return null;
}
