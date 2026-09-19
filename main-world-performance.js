/* Rel.AI Companion — MAIN-world long-conversation payload window
 *
 * This script is dynamically registered only when Long Chat Window is enabled.
 * It trims the client-side copy of very large conversation graphs before
 * ChatGPT's UI consumes them. The server copy is never changed.
 */
(function (root) {
  'use strict';

  const DEFAULT_MAX_ACTIVE_NODES = 80;
  const DEFAULT_MIN_MAPPING_NODES = 160;
  const CONVERSATION_PATH = /^\/backend-api\/conversation\/[^/?#]+\/?$/;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requestUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, root?.location?.href || 'https://chatgpt.com/');
      if (input && typeof input.url === 'string') return new URL(input.url, root?.location?.href || 'https://chatgpt.com/');
    } catch (_) {}
    return null;
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || 'GET').toUpperCase();
  }

  function isConversationRequest(input, init) {
    if (requestMethod(input, init) !== 'GET') return false;
    const url = requestUrl(input);
    if (!url) return false;
    if (root?.location?.origin && url.origin !== root.location.origin) return false;
    return CONVERSATION_PATH.test(url.pathname);
  }

  function activeChain(mapping, currentNode) {
    const chain = [];
    const seen = new Set();
    let id = currentNode;

    while (typeof id === 'string' && mapping[id] && !seen.has(id)) {
      seen.add(id);
      chain.push(id);
      const parent = mapping[id]?.parent;
      id = typeof parent === 'string' ? parent : null;
    }
    return chain;
  }

  function cloneWindowedNode(node, kept) {
    const copy = { ...node };
    if (Array.isArray(node.children)) {
      copy.children = node.children.filter((id) => kept.has(id));
    }
    if (typeof node.parent === 'string' && !kept.has(node.parent)) {
      copy.parent = null;
    }
    return copy;
  }

  function trimConversationPayload(payload, options = {}) {
    const maxActiveNodes = Math.max(20, Number(options.maxActiveNodes) || DEFAULT_MAX_ACTIVE_NODES);
    const minMappingNodes = Math.max(maxActiveNodes + 20, Number(options.minMappingNodes) || DEFAULT_MIN_MAPPING_NODES);

    if (!isObject(payload) || !isObject(payload.mapping) || typeof payload.current_node !== 'string') {
      return { changed: false, payload, reason: 'shape' };
    }

    const mapping = payload.mapping;
    const ids = Object.keys(mapping);
    if (ids.length < minMappingNodes || !mapping[payload.current_node]) {
      return { changed: false, payload, reason: 'small' };
    }

    const chainNewestFirst = activeChain(mapping, payload.current_node);
    if (!chainNewestFirst.length) {
      return { changed: false, payload, reason: 'chain' };
    }

    const rootId = chainNewestFirst[chainNewestFirst.length - 1];
    const recent = chainNewestFirst.slice(0, maxActiveNodes);
    const kept = new Set(recent);
    kept.add(rootId);

    // If the active branch already accounts for essentially the whole mapping,
    // there is little value in manufacturing a new graph.
    if (kept.size >= ids.length - 4) {
      return { changed: false, payload, reason: 'no_gain' };
    }

    const nextMapping = {};
    for (const id of kept) {
      const node = mapping[id];
      if (!node) continue;
      nextMapping[id] = cloneWindowedNode(node, kept);
    }

    const oldestRecentId = recent[recent.length - 1];
    if (rootId !== oldestRecentId && nextMapping[rootId] && nextMapping[oldestRecentId]) {
      nextMapping[rootId].parent = null;
      nextMapping[rootId].children = [oldestRecentId];
      nextMapping[oldestRecentId].parent = rootId;
    } else if (nextMapping[rootId]) {
      nextMapping[rootId].parent = null;
    }

    return {
      changed: true,
      payload: { ...payload, mapping: nextMapping },
      originalNodes: ids.length,
      retainedNodes: Object.keys(nextMapping).length
    };
  }

  function install(target) {
    if (!target || typeof target.fetch !== 'function') return null;

    const existing = target.__RELAI_LONG_CHAT_WINDOW__;
    if (existing?.installed) {
      existing.enable?.();
      return existing;
    }

    const nativeFetch = target.fetch.bind(target);
    const state = {
      installed: true,
      enabled: true,
      trims: 0,
      lastOriginalNodes: 0,
      lastRetainedNodes: 0,
      enable() {
        state.enabled = true;
        try { document.documentElement?.setAttribute('data-relai-long-chat-window', 'ready'); } catch (_) {}
      },
      disable() {
        state.enabled = false;
        try { document.documentElement?.setAttribute('data-relai-long-chat-window', 'disabled'); } catch (_) {}
      }
    };

    target.__RELAI_LONG_CHAT_WINDOW__ = state;
    state.enable();

    target.fetch = async function relaiWindowedFetch(input, init) {
      const response = await nativeFetch(input, init);
      if (!state.enabled || !isConversationRequest(input, init)) return response;

      const contentType = response.headers?.get?.('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) return response;

      try {
        const payload = await response.clone().json();
        const result = trimConversationPayload(payload);
        if (!result.changed) return response;

        state.trims += 1;
        state.lastOriginalNodes = result.originalNodes;
        state.lastRetainedNodes = result.retainedNodes;
        try {
          document.documentElement?.setAttribute(
            'data-relai-long-chat-window',
            `trimmed:${result.originalNodes}:${result.retainedNodes}`
          );
        } catch (_) {}

        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');

        return new Response(JSON.stringify(result.payload), {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (_) {
        // Fail open. ChatGPT receives its original response on any parse,
        // schema, cloning, or reconstruction problem.
        return response;
      }
    };

    return state;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_MAX_ACTIVE_NODES,
      DEFAULT_MIN_MAPPING_NODES,
      activeChain,
      isConversationRequest,
      trimConversationPayload
    };
  } else {
    install(root);
  }
})(typeof window !== 'undefined' ? window : null);
