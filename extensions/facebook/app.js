import { isFacebookReel } from "./reels.js";

/**
 * @typedef {import('../types').Story} Story
 */

/**
 * Handle DOM fallback extraction for Facebook posts/reels.
 * @param {Story} story
 * @returns {{ mediaUrls: string[], ext: string }}
 */
export function facebookFallbackDownload(story) {
  let mediaUrls = [];
  let ext = "mp4";

  const node = /** @type {any} */ (story)._node;
  console.log("[fpdl] facebookFallbackDownload - Provided _node:", node);

  // Walk up the DOM tree from the action button until we find an ancestor
  // that contains a video or a large image. This perfectly identifies the
  // lowest common ancestor (the post wrapper) without relying on volatile CSS classes!
  let searchRoot = node;
  if (node) {
    while (searchRoot && searchRoot !== document.body) {
      // Check if this ancestor contains a video
      if (searchRoot.querySelector("video")) {
        break;
      }
      // Check if this ancestor contains a large image
      const imgs = Array.from(searchRoot.querySelectorAll("img"));
      const hasLargeImg = imgs.some(
        (img) => img.offsetHeight > 100 && img.offsetWidth > 100,
      );
      if (hasLargeImg) {
        break;
      }
      searchRoot = searchRoot.parentElement;
    }
  }

  if (!searchRoot || searchRoot === document.body) {
    searchRoot = document;
  }

  console.log(
    "[fpdl] facebookFallbackDownload - Search root resolved to:",
    searchRoot,
  );

  const isReel =
    isFacebookReel(story) || window.location.href.includes("/reel/");
  const videoSelector = isReel
    ? 'div[role="main"] video, .x1useyqa video, .xpdmqnj video'
    : "video";
  const video =
    searchRoot.querySelector(videoSelector) ||
    searchRoot.querySelector("video");
  console.log("[fpdl] facebookFallbackDownload - Video element found:", video);

  if (video) {
    // @ts-ignore
    const fiberKey = Object.keys(video).find((k) =>
      k.startsWith("__reactFiber$"),
    );
    if (fiberKey) {
      // @ts-ignore
      let fiber = video[fiberKey];
      let depth = 0;
      while (fiber && depth < 50) {
        const props = fiber.memoizedProps;
        
        // Recursively search for the video URL in the fiber props
        const findVideoUrl = (obj, level = 0) => {
          if (!obj || level > 15 || typeof obj !== 'object') return null;
          
          // Fast path direct checks
          if (typeof obj.playable_url_quality_hd === 'string') return obj.playable_url_quality_hd;
          if (typeof obj.browser_native_hd_url === 'string') return obj.browser_native_hd_url;
          if (typeof obj.hd_src === 'string') return obj.hd_src;
          if (typeof obj.playable_url === 'string') return obj.playable_url;
          if (typeof obj.sd_src === 'string') return obj.sd_src;
          if (typeof obj.hdSrc === 'string') return obj.hdSrc;
          if (typeof obj.sdSrc === 'string') return obj.sdSrc;
          if (typeof obj.video_url === 'string') return obj.video_url;
          if (typeof obj.url === 'string' && obj.__typename === 'Video') return obj.url;
          
          // Special array cases
          if (Array.isArray(obj.video_versions) && obj.video_versions[0]?.url) return obj.video_versions[0].url;
          if (Array.isArray(obj.progressive_urls) && obj.progressive_urls[0]?.progressive_url) {
            // Find HD if available
            const hd = obj.progressive_urls.find(x => x?.metadata?.quality === "HD" && x?.progressive_url);
            return hd ? hd.progressive_url : obj.progressive_urls[0].progressive_url;
          }

          for (const key of Object.keys(obj)) {
            // Skip React internals and DOM nodes to avoid cycles and huge trees
            if (key === 'children' || key === '_owner' || key.startsWith('__')) continue;
            
            const res = findVideoUrl(obj[key], level + 1);
            if (res) return res;
          }
          return null;
        };

        let foundMediaUrl = findVideoUrl(props);

        if (
          foundMediaUrl &&
          typeof foundMediaUrl === "string" &&
          !foundMediaUrl.startsWith("blob:")
        ) {
          mediaUrls.push(foundMediaUrl);
          break;
        }
        fiber = fiber.return;
        depth++;
      }
    }
    if (mediaUrls.length === 0) {
      let fallbackSrc = video.querySelector("source")?.src || video.src;
      if (fallbackSrc) {
        mediaUrls.push(fallbackSrc);
        console.log(
          "[fpdl] facebookFallbackDownload - Falling back to video.src:",
          fallbackSrc,
        );
      }
    } else {
      console.log(
        "[fpdl] facebookFallbackDownload - Extracted mediaUrl from Fiber:",
        mediaUrls[0],
      );
    }
  }

  // If video extraction failed (or no video found), try image extraction
  if (mediaUrls.length === 0) {
    // Find ALL images within the search root
    // Instead of relying on volatile CSS classes, we just evaluate all images and pick the largest one.
    const imgCandidates = Array.from(searchRoot.querySelectorAll("img"));
    console.log(
      "[fpdl] facebookFallbackDownload - Initial image candidates found:",
      imgCandidates.length,
    );

    const largeImgs = imgCandidates.filter(
      (img) => img.offsetHeight > 100 && img.offsetWidth > 100,
    );
    // Sort largest first
    largeImgs.sort(
      (a, b) => b.offsetHeight * b.offsetWidth - a.offsetHeight * a.offsetWidth,
    );

    for (const i of largeImgs) {
      const imgElement = /** @type {HTMLImageElement} */ (i);
      let bestSrc = null;

      // Try finding HD url via React Fiber
      // @ts-ignore
      const fiberKey = Object.keys(imgElement).find((k) =>
        k.startsWith("__reactFiber$"),
      );
      if (fiberKey) {
        // @ts-ignore
        let fiber = imgElement[fiberKey];
        let depth = 0;
        while (fiber && depth < 20) {
          // check up to 20 levels up
          const p = fiber.memoizedProps;
          if (p?.image?.uri) {
            bestSrc = p.image.uri;
            break;
          }
          if (p?.photo_image?.uri) {
            bestSrc = p.photo_image.uri;
            break;
          }
          if (p?.attachment?.media?.image?.uri) {
            bestSrc = p.attachment.media.image.uri;
            break;
          }
          if (p?.media?.image?.uri) {
            bestSrc = p.media.image.uri;
            break;
          }
          fiber = fiber.return;
          depth++;
        }
      }

      if (!bestSrc) {
        const srcset = imgElement.srcset || imgElement.getAttribute("srcset");
        if (srcset) {
          const sources = srcset.split(",").map((s) => {
            const parts = s.trim().split(" ");
            return { url: parts[0], width: parseInt(parts[1]) || 0 };
          });
          if (sources.length > 0) {
            bestSrc = sources.sort((a, b) => b.width - a.width)[0].url;
          }
        }
      }

      if (!bestSrc) {
        bestSrc = imgElement.src;
      }

      if (bestSrc && !mediaUrls.includes(bestSrc)) {
        mediaUrls.push(bestSrc);
      }
    }

    if (mediaUrls.length > 0) {
      ext = "jpg";
    }
  }

  console.log("[fpdl] facebookFallbackDownload - Final fallback result:", {
    mediaUrls,
    ext,
  });
  return { mediaUrls, ext };
}
