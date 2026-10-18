/**
 * Utility helpers for robust parsing and embedding of YouTube, Google Drive, and Direct Video URLs.
 */

/**
 * Extracts clean 11-character YouTube Video ID from any input:
 * - https://www.youtube.com/watch?v=ID
 * - https://youtu.be/ID
 * - https://www.youtube.com/shorts/ID
 * - https://www.youtube.com/live/ID
 * - https://www.youtube.com/embed/ID
 * - https://m.youtube.com/watch?v=ID
 * - <iframe ... src="https://www.youtube.com/embed/ID" ...></iframe>
 * - Raw 11-character ID: ID
 */
export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. If an iframe embed tag was pasted, extract the src URL first
  const iframeSrcMatch = trimmed.match(/src=["'](https?:\/\/[^"']+)["']/i);
  const target = iframeSrcMatch ? iframeSrcMatch[1] : trimmed;

  // 2. If it's already an 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(target)) {
    return target;
  }

  // 3. YouTube Shorts: https://(www.)?youtube.com/shorts/VIDEO_ID
  const shortsMatch = target.match(/(?:youtube\.com\/(?:shorts|live)\/)([a-zA-Z0-9_-]{11})/i);
  if (shortsMatch && shortsMatch[1]) {
    return shortsMatch[1];
  }

  // 4. Standard watch, youtu.be, embed, v
  const standardMatch = target.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/i
  );
  if (standardMatch && standardMatch[1]) {
    return standardMatch[1];
  }

  // 5. Broad YouTube regex fallback
  const broadMatch = target.match(
    /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i
  );
  if (broadMatch && broadMatch[1]) {
    return broadMatch[1];
  }

  return null;
}

/**
 * Check if the input is any valid YouTube link or ID
 */
export function isYouTubeUrl(input: string): boolean {
  return extractYouTubeId(input) !== null;
}

/**
 * Get high-quality thumbnail for YouTube video
 */
export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Get standard canonical YouTube watch link
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Get privacy-enhanced responsive embed URL for iframe
 */
export function getYouTubeEmbedUrl(videoId: string, autoplay = false): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1'
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Extracts Google Drive File ID and returns preview URL
 */
export function getGoogleDriveEmbedUrl(rawUrl: string): string {
  try {
    if (!rawUrl || !rawUrl.includes('drive.google.com')) return rawUrl;
    const match = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}
