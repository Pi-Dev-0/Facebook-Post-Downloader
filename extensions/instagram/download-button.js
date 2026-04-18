import { getStoryPostId } from "../facebook/story.js";
import { createDownloadButton, isActiveReel } from "../download-button.js";

/**
 * @typedef {import('../types').Story} Story
 */

/**
 * Inject download buttons into Instagram Feed and Reels.
 * @param {Story[]} stories
 * @param {(story: Story) => Promise<void>} downloadStory
 */
export function injectInstagramButtons(stories, downloadStory) {
  if (!window.location.hostname.includes("instagram.com")) return;

  const processedPosts = new Set();

  const moreBtns = document.querySelectorAll(
    'svg[aria-label="More options"], svg[aria-label="More"]',
  );
  for (const moreSvg of moreBtns) {
    const btnRole =
      moreSvg.closest('[role="button"]') || moreSvg.closest("button");
    if (!btnRole) continue;

    const innerWrapper = btnRole.parentElement;
    if (!innerWrapper) continue;

    const container = innerWrapper.parentElement;
    if (!container) continue;

    const post =
      container.closest('article, [role="dialog"], main') || container;
    if (processedPosts.has(post)) continue;

    let shortcode;
    const headerLinks = container.querySelectorAll(
      'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]',
    );
    for (const link of headerLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(
        /\/(?:p|reel|reels)\/(?!audio\/|videos\/)([A-Za-z0-9_-]+)/,
      );
      if (match && match[1]) {
        shortcode = match[1];
        break;
      }
    }

    if (!shortcode && post !== container) {
      const postLinks = post.querySelectorAll(
        'a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]',
      );
      for (const link of postLinks) {
        const href = link.getAttribute("href") || "";
        const match = href.match(
          /\/(?:p|reel|reels)\/(?!audio\/|videos\/)([A-Za-z0-9_-]+)/,
        );
        if (match && match[1]) {
          shortcode = match[1];
          break;
        }
      }
    }

    if (!shortcode) {
      const match = window.location.pathname.match(
        /\/(?:reels|reel|p)\/([A-Za-z0-9_-]+)/,
      );
      if (match && isActiveReel(container)) shortcode = match[1];
    }

    if (!shortcode) continue;
    processedPosts.add(post);

    const story = stories.find((s) => getStoryPostId(s) === shortcode) || {
      id: shortcode,
      shortcode: shortcode,
      __typename: "InstagramStory",
      placeholder: true,
    };

    const existingBtns = post.querySelectorAll(".fpdl-download-btn");
    let btnAlreadyExists = false;
    for (const btn of existingBtns) {
      if (btn.getAttribute("data-shortcode") === shortcode) {
        const isPlaceholder = btn.dataset.placeholder === "true";
        if (isPlaceholder && !story.placeholder) {
          btn.remove();
        } else {
          btnAlreadyExists = true;
        }
      } else {
        btn.remove();
      }
    }
    if (btnAlreadyExists) continue;

    const downloadBtn = createDownloadButton(story, downloadStory);
    downloadBtn.setAttribute("data-shortcode", shortcode);
    if (story.placeholder) downloadBtn.dataset.placeholder = "true";

    const isSidebar =
      window.getComputedStyle(container).flexDirection === "column" ||
      container.classList.contains("x1247r65");

    if (isSidebar) {
      downloadBtn.classList.add("fpdl-download-btn--instagram-reel");
      const audio = container.querySelector('.xjwep3j, img[alt*="Audio"]');
      if (audio) {
        let target = audio;
        while (target && target.parentElement !== container)
          target = target.parentElement;
        container.insertBefore(downloadBtn, target || audio);
      } else {
        container.appendChild(downloadBtn);
      }
    } else {
      downloadBtn.classList.add("fpdl-download-btn--instagram-header");
      container.insertBefore(downloadBtn, innerWrapper);
    }
  }
}

/**
 * Inject download buttons into Instagram Stories viewer header.
 * @param {Story[]} stories
 * @param {(story: Story) => Promise<void>} downloadStory
 */
export function injectInstagramStoryButtons(stories, downloadStory) {
  if (
    !window.location.hostname.includes("instagram.com") ||
    !window.location.href.includes("/stories/")
  )
    return;

  // Target the "Menu" button in the story header
  const menuBtn = document
    .querySelector('section svg[aria-label="Menu"]')
    ?.closest('[role="button"]');
  if (!menuBtn) return;

  const headerTray = menuBtn.parentElement;
  if (!headerTray) return;

  // Extract IDs from URL: /stories/username/storyId/ or /stories/highlights/REEL_ID/
  const parts = window.location.pathname.split("/").filter(Boolean);
  const urlParams = new URLSearchParams(window.location.search);
  const mediaIdFromUrl = urlParams.get("media_id");

  const isHighlight = parts[1] === "highlights";
  const reelId = isHighlight ? parts[2] : null;
  const storyIdFromPath = isHighlight ? null : parts[2];
  const storyId = mediaIdFromUrl || storyIdFromPath || reelId;

  if (!storyId) return;

  const existingBtn = headerTray.querySelector(
    ".fpdl-download-btn-insta-story",
  );
  if (existingBtn) {
    if (existingBtn.getAttribute("data-story-id") === storyId) {
      return;
    }
    existingBtn.remove();
  }

  const story = stories.find((s) => getStoryPostId(s) === storyId) || {
    id: storyId,
    shortcode: storyId,
    reelId: reelId,
    __typename: "InstagramStory",
    placeholder: true,
  };

  const downloadBtn = createDownloadButton(story, downloadStory);
  downloadBtn.classList.add("fpdl-download-btn-insta-story");
  downloadBtn.setAttribute("data-story-id", storyId);

  // Apply classes from the Menu button to match styling exactly
  if (menuBtn.className) {
    downloadBtn.className += " " + menuBtn.className;
  }

  // Ensure it has the correct sizing and layout
  downloadBtn.style.display = "flex";
  downloadBtn.style.alignItems = "center";
  downloadBtn.style.justifyContent = "center";
  downloadBtn.style.width = "32px";
  downloadBtn.style.height = "32px";
  downloadBtn.style.marginRight = "8px";
  downloadBtn.style.backgroundColor = "transparent";
  downloadBtn.style.border = "none";
  downloadBtn.style.cursor = "pointer";
  downloadBtn.style.color = "white";

  // Insert before the Menu button in the header tray
  headerTray.insertBefore(downloadBtn, menuBtn);
}
