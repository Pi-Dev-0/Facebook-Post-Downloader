(function () {
   /**
    * Sends a message to the background script.
    * @param {import("./types").AppMessage} message
    */
   function sendChromeMessage(message) {
     if (!chrome.runtime?.id) return;
     try {
       chrome.runtime.sendMessage(message).catch(() => {
         // Ignore messaging errors (e.g. background script not ready)
       });
     } catch {
       // Ignore context invalidated errors
     }
   }

   /**
    * @param {unknown} value
    * @returns {value is (import("./types").AppMessage & { __fpdl: true })}
    */
   function isAppMessage(value) {
     if (!value || typeof value !== "object") return false;
     const obj = /** @type {Record<string, unknown>} */ (value);
     return obj.__fpdl === true;
   }

   /**
    * Injects a script tag into the page.
    * @param {string} relativePath
    * @param {string} id
    * @param {boolean} isModule
    * @returns {Promise<void>}
    */
   function injectScript(relativePath, id, isModule = false) {
     return new Promise((resolve, reject) => {
       if (document.getElementById(id)) {
         resolve();
         return;
       }

       const script = document.createElement("script");
       script.id = id;
       if (isModule) script.type = "module";
       script.src = chrome.runtime.getURL(relativePath);
       script.onload = () => {
         resolve();
       };
       script.onerror = (e) => {
         console.warn(`[fpdl] Failed to load ${relativePath}`, e);
         reject(e);
       };
       (document.head || document.documentElement).appendChild(script);
     });
   }

   /**
    * Injects app scripts into the page context.
    * @returns {Promise<void>}
    */
   async function injectAppScripts() {
     try {
       // 1. Inject React UMD (sets window.React)
       await injectScript(
         "node_modules/umd-react/dist/react.production.min.js",
         "fpdl-react-script",
       );
       // 2. Inject ReactDOM UMD (sets window.ReactDOM)
       await injectScript(
         "node_modules/umd-react/dist/react-dom.production.min.js",
         "fpdl-react-dom-script",
       );
       // 3. Inject app.js as a module
       await injectScript("extensions/app.js", "fpdl-app-script", true);
     } catch (err) {
       console.warn("[fpdl] Failed to inject app scripts", err);
     }
   }

   injectAppScripts();

   // Remove Permissions-Policy meta tag with bluetooth to prevent warning
   const metaTags = document.querySelectorAll('meta[http-equiv="Permissions-Policy"]');
   for (const meta of metaTags) {
     if (meta.getAttribute('content')?.includes('bluetooth')) {
       meta.remove();
     }
   }

   // Suppress Permissions-Policy bluetooth warning if still shown
   const originalWarn = console.warn;
   console.warn = function(...args) {
     if (args.some(arg => typeof arg === 'string' && arg.includes("Unrecognized feature: 'bluetooth'"))) return;
     originalWarn.apply(console, args);
   };
   const originalError = console.error;
   console.error = function(...args) {
     if (args.some(arg => typeof arg === 'string' && arg.includes("Unrecognized feature: 'bluetooth'"))) return;
     originalError.apply(console, args);
   };

   // Forward messages from background to page context
   chrome.runtime.onMessage.addListener(
     (/** @type {import("./types").ChromeMessage} */ message) => {
       if (message.type === "FPDL_TOGGLE") {
         window.postMessage(
           { __fpdl: true, type: "FPDL_TOGGLE" },
           window.location.origin,
         );
       } else if (message.type === "FPDL_DOWNLOAD_RESULT") {
         window.postMessage(
           {
             __fpdl: true,
             type: "FPDL_DOWNLOAD_RESULT",
             storyId: message.storyId,
             url: message.url,
             filename: message.filename,
             status: message.status,
           },
           window.location.origin,
         );
       }
     },
   );

   // Bridge download requests from page-world UI to the extension background.
   window.addEventListener("message", (event) => {
     try {
       if (event.source !== window) return;

       const data = event.data;
       if (!isAppMessage(data)) return;

       if (data.type === "FPDL_STORY_COUNT" && typeof data.count === "number") {
         sendChromeMessage({ type: "FPDL_STORY_COUNT", count: data.count });
       } else if (
         data.type === "FPDL_DOWNLOAD" &&
         typeof data.storyId === "string" &&
         typeof data.url === "string" &&
         typeof data.filename === "string"
       ) {
         sendChromeMessage({
           type: "FPDL_DOWNLOAD",
           storyId: data.storyId,
           url: data.url,
           filename: data.filename,
         });
       }
     } catch (err) {
       console.warn("[fpdl] download bridge failed", err);
     }
   });
})();
