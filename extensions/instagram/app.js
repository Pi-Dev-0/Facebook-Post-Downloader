/**
 * @typedef {import('../types').Story} Story
 */

/**
 * Handle DOM fallback extraction for Instagram stories/reels/posts.
 * @param {Story} story 
 * @returns {{ mediaUrl: string | null, ext: string }}
 */
export function instagramFallbackDownload(story) {
  let mediaUrl = null;
  let ext = "mp4";

  const video = document.querySelector("section video, article video, main video, div[aria-label='Reels Viewer'] video");
  if (video) {
    // Try finding the real URL in React Fiber props (traversing up)
    // @ts-ignore
    const fiberKey = Object.keys(video).find((k) =>
      k.startsWith("__reactFiber$"),
    );
    if (fiberKey) {
      // @ts-ignore
      let fiber = video[fiberKey];
      while (fiber) {
        const props = fiber.memoizedProps;
        mediaUrl =
          props?.videoData?.$1?.playable_url_quality_hd ||
          props?.videoData?.$1?.browser_native_hd_url ||
          props?.videoData?.$1?.hd_src ||
          props?.videoData?.$1?.playable_url ||
          props?.videoData?.$1?.sd_src ||
          props?.children?.props?.children?.props?.implementations?.[0]
            ?.data?.hdSrc ||
          props?.videoData?.hdSrc ||
          props?.videoData?.sdSrc ||
          props?.item?.video_versions?.[0]?.url ||
          props?.video_versions?.[0]?.url ||
          props?.item?.image_versions2?.candidates?.[0]?.url ||
          props?.image_versions2?.candidates?.[0]?.url;

        if (
          mediaUrl &&
          typeof mediaUrl === "string" &&
          !mediaUrl.startsWith("blob:")
        )
          break;
        fiber = fiber.return;
      }
    }
    if (!mediaUrl || mediaUrl.startsWith("blob:")) {
      mediaUrl = video.querySelector("source")?.src || /** @type {HTMLVideoElement} */(video).src;
    }
  } else {
    const img = document.querySelector("section img[srcset], section img.x5yr21d");
    if (img) {
      if (/** @type {HTMLImageElement} */ (img).srcset) {
        const sources = /** @type {HTMLImageElement} */ (img).srcset
          .split(",")
          .map((s) => {
            const [url, size] = s.trim().split(" ");
            return { url, width: parseInt(size) || 0 };
          });
        if (sources.length > 0) {
          mediaUrl = sources.sort((a, b) => b.width - a.width)[0].url;
        }
      }
      if (!mediaUrl) mediaUrl = (/** @type {HTMLImageElement} */ (img)).src;
      ext = "jpg";
    }
  }

  return { mediaUrl, ext };
}
