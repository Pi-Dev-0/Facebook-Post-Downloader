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
      while (fiber) {
        const props = fiber.memoizedProps;
        // Prioritize HD sources
        let foundMediaUrl =
          props?.videoData?.$1?.playable_url_quality_hd ||
          props?.videoData?.$1?.browser_native_hd_url ||
          props?.videoData?.$1?.hd_src ||
          props?.videoData?.$1?.playable_url ||
          props?.videoData?.$1?.sd_src ||
          props?.children?.props?.children?.props?.implementations?.[0]?.data
            ?.hdSrc ||
          props?.implementations?.[0]?.data?.hdSrc ||
          props?.videoData?.hdSrc ||
          props?.videoData?.sdSrc ||
          props?.item?.video_versions?.[0]?.url ||
          props?.video_versions?.[0]?.url;

        if (
          foundMediaUrl &&
          typeof foundMediaUrl === "string" &&
          !foundMediaUrl.startsWith("blob:")
        ) {
          mediaUrls.push(foundMediaUrl);
          break;
        }
        fiber = fiber.return;
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
