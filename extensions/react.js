/**
 * @template T
 * @param {() => T | null | undefined} getter
 * @param {number} maxRetries
 * @param {number} delay
 * @returns {Promise<T>}
 */
async function waitFor(getter, maxRetries = 200, delay = 100) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const value = getter();
      if (value) return value;
    } catch (e) {
      // ignore getter errors
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  const error = new Error(`waitFor timeout after ${maxRetries * delay}ms`);
  console.error("[fpdl] waitFor timeout", {
    getter: getter.toString(),
    windowReact: !!window.React,
    windowReactDOM: !!window.ReactDOM,
    topReact: !!window.top?.React,
    hasRequire: typeof require === "function",
  });
  throw error;
}

/**
 * Get React or ReactDOM from global scope or parent frames.
 * @param {string} name
 * @returns {any}
 */
function getGlobal(name) {
  // @ts-ignore
  const g = window[name] || window.parent?.[name] || window.top?.[name];
  if (g) return g;

  // Try Instagram's internal require if available
  try {
    // @ts-ignore
    if (typeof require === "function") {
      return require(name);
    }
  } catch (e) {}

  return null;
}

// @ts-ignore
export const React = await waitFor(() => getGlobal("React"));

// @ts-ignore
export const ReactDOM = await waitFor(() => getGlobal("ReactDOM"));
