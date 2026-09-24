/* ============================================================
   Ketor -- Translation API Fallback Chain
   ------------------------------------------------------------
   Free APIs only (no key required), tried in order:
   1. MyMemory        -- 1M chars/month, stable
   2. Google Translate (unofficial) -- unlimited, may rate-limit
   3. LibreTranslate  -- public instances, unlimited
   4. Apertium        -- unlimited, smaller language coverage

   Optional custom API (user supplies key): see TRANSLATOR_PROVIDERS
   below. Most of them speak the OpenAI chat completions shape, so one
   client covers them; DeepL, LibreTranslate and Google Cloud have their
   own shapes.

   User pays for custom API usage. Default chain is free.
   ============================================================ */

(function (global) {
  'use strict';

  var Ketor = global.Ketor = global.Ketor || {};
  Ketor.core = Ketor.core || {};

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /**
   * MyMemory -- free, 1M chars/month, no key.
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  function translateMyMemory(text, sourceLang, targetLang) {
    var pair = sourceLang + '|' + targetLang;
    var url = 'https://api.mymemory.translated.net/get?q=' +
              encodeURIComponent(text) + '&langpair=' + encodeURIComponent(pair);
    return fetchJson(url).then(function (data) {
      if (data.responseStatus !== 200) {
        throw new Error(data.responseDetails || 'MyMemory error');
      }
      return (data.responseData && data.responseData.translatedText) || text;
    });
  }

  /**
   * Google Translate unofficial -- no key, may rate-limit.
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  function translateGoogleUnofficial(text, sourceLang, targetLang) {
    var url = 'https://translate.googleapis.com/translate_a/single' +
              '?client=gtx&sl=' + encodeURIComponent(sourceLang) +
              '&tl=' + encodeURIComponent(targetLang) +
              '&dt=t&q=' + encodeURIComponent(text);
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error('Google Translate unexpected response');
      }
      var parts = [];
      for (var i = 0; i < data[0].length; i++) {
        if (data[0][i] && data[0][i][0]) parts.push(data[0][i][0]);
      }
      return parts.join('') || text;
    });
  }

  /**
   * LibreTranslate public instance -- no key.
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  function translateLibreTranslate(text, sourceLang, targetLang) {
    var endpoints = [
      'https://libretranslate.com/translate',
      'https://translate.argosopentech.com/translate',
      'https://libretranslate.de/translate'
    ];
    var body = JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    });
    var tryEndpoint = function (idx) {
      if (idx >= endpoints.length) return Promise.reject(new Error('All LibreTranslate endpoints failed'));
      return fetch(endpoints[idx], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (!data.translatedText) throw new Error('LibreTranslate empty response');
        return data.translatedText;
      }).catch(function () {
        return tryEndpoint(idx + 1);
      });
    };
    return tryEndpoint(0);
  }

  /**
   * Apertium -- no key, unlimited, smaller language coverage.
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @returns {Promise<string>}
   */
  function translateApertium(text, sourceLang, targetLang) {
    var pair = sourceLang + '-' + targetLang;
    var url = 'https://apertium.org/apy/translate?langpair=' +
              encodeURIComponent(pair) + '&q=' + encodeURIComponent(text);
    return fetchJson(url).then(function (data) {
      if (data.responseStatus !== 200) {
        throw new Error('Apertium error: ' + (data.responseDetails || 'unknown'));
      }
      return data.responseData.translatedText || text;
    });
  }

  /* ============================================================
     Optional providers. One entry drives both the request and the
     dropdown in the UI, so a provider only has to be added here.
     Model names change often: the model in the entry is only the
     starting value the UI offers, and it stays editable.
     ============================================================ */
  var TRANSLATOR_PROVIDERS = [
    { id: 'openai', label: 'OpenAI', kind: 'chat',
      endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
    { id: 'deepseek', label: 'DeepSeek', kind: 'chat',
      endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' },
    { id: 'openrouter', label: 'OpenRouter', kind: 'chat',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini' },
    { id: 'groq', label: 'Groq', kind: 'chat',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
    { id: 'mistral', label: 'Mistral', kind: 'chat',
      endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
    { id: 'together', label: 'Together AI', kind: 'chat',
      endpoint: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
    { id: 'xai', label: 'xAI Grok', kind: 'chat',
      endpoint: 'https://api.x.ai/v1/chat/completions', model: 'grok-2-latest' },
    { id: 'ollama', label: 'Ollama (local)', kind: 'chat',
      endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1' },
    { id: 'lmstudio', label: 'LM Studio (local)', kind: 'chat',
      endpoint: 'http://localhost:1234/v1/chat/completions', model: 'local-model' },
    { id: 'deepl', label: 'DeepL (free tier)', kind: 'deepl',
      endpoint: 'https://api-free.deepl.com/v2/translate', model: '' },
    { id: 'deepl-pro', label: 'DeepL Pro', kind: 'deepl',
      endpoint: 'https://api.deepl.com/v2/translate', model: '' },
    { id: 'libretranslate', label: 'LibreTranslate (own server)', kind: 'libre',
      endpoint: 'http://localhost:5000/translate', model: '' },
    { id: 'google-cloud', label: 'Google Cloud Translation', kind: 'google',
      endpoint: 'https://translation.googleapis.com/language/translate/v2', model: '' },
    { id: 'custom', label: 'Custom endpoint', kind: 'chat',
      endpoint: '', model: '' }
  ];

  function getProvider(id) {
    var want = String(id || '').toLowerCase();
    for (var i = 0; i < TRANSLATOR_PROVIDERS.length; i++) {
      if (TRANSLATOR_PROVIDERS[i].id === want) return TRANSLATOR_PROVIDERS[i];
    }
    return null;
  }

  function _systemPrompt(cfg) {
    // The line breaks arrive as real newlines, so the model has to preserve
    // the line structure of the source: a line break costs one byte in the
    // ROM and a missing one changes how the text is drawn. Tokens that are
    // still in square brackets are control codes the game reads, so they are
    // copied verbatim and never translated, explained or added.
    return 'You are a translator inside a ROM translation tool. Translate from ' +
      cfg.sourceLang + ' to ' + cfg.targetLang +
      '. Keep every line break of the source: the translation must have the ' +
      'same number of lines. Keep any token in square brackets exactly as it ' +
      'is and never add tokens that are not in the source. Output only the translation.';
  }

  function _httpJson(url, options) {
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  // OpenAI chat completions shape. Covers most hosted and local providers.
  function _chatTranslate(text, cfg) {
    return _httpJson(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: _systemPrompt(cfg) },
          { role: 'user', content: text }
        ]
      })
    }).then(function (data) {
      var choice = data && data.choices && data.choices[0];
      var content = choice && choice.message && choice.message.content;
      if (!content) throw new Error('Empty response from the provider');
      return String(content).trim();
    });
  }

  function _deeplTranslate(text, cfg) {
    return _httpJson(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'DeepL-Auth-Key ' + cfg.apiKey
      },
      body: 'text=' + encodeURIComponent(text) +
            '&source_lang=' + encodeURIComponent(cfg.sourceLang) +
            '&target_lang=' + encodeURIComponent(cfg.targetLang)
    }).then(function (data) {
      var out = data && data.translations && data.translations[0] && data.translations[0].text;
      if (!out) throw new Error('Empty response from DeepL');
      return out;
    });
  }

  function _libreTranslate(text, cfg) {
    return _httpJson(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text, source: cfg.sourceLang, target: cfg.targetLang, format: 'text',
        api_key: cfg.apiKey || undefined
      })
    }).then(function (data) {
      if (!data || !data.translatedText) throw new Error('Empty response from LibreTranslate');
      return data.translatedText;
    });
  }

  function _googleTranslate(text, cfg) {
    var url = cfg.endpoint + '?key=' + encodeURIComponent(cfg.apiKey);
    return _httpJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: cfg.sourceLang, target: cfg.targetLang, format: 'text' })
    }).then(function (data) {
      var out = data && data.data && data.data.translations && data.data.translations[0] &&
        data.data.translations[0].translatedText;
      if (!out) throw new Error('Empty response from Google Cloud Translation');
      return out;
    });
  }

  /**
   * Translate through one of the optional providers.
   * The endpoint comes from TRANSLATOR_PROVIDERS unless the caller supplies
   * one, which is what the "custom endpoint" entry does.
   * @param {string} text
   * @param {Object} customConfig - {provider, apiKey, model, endpoint, sourceLang, targetLang}
   * @returns {Promise<string>}
   */
  function translateCustom(text, customConfig) {
    var cfg = customConfig || {};
    if (!cfg.apiKey) return Promise.reject(new Error('No API key set for this provider'));
    var provider = getProvider(cfg.provider);
    var endpoint = cfg.endpoint || (provider && provider.endpoint) || '';
    if (!endpoint) return Promise.reject(new Error('No endpoint configured for this provider'));
    var kind = provider ? provider.kind : 'chat';
    var resolved = {
      endpoint: endpoint,
      apiKey: cfg.apiKey,
      model: cfg.model || (provider && provider.model) || '',
      sourceLang: cfg.sourceLang || 'en',
      targetLang: cfg.targetLang || 'id'
    };
    if (kind === 'deepl') return _deeplTranslate(text, resolved);
    if (kind === 'libre') return _libreTranslate(text, resolved);
    if (kind === 'google') return _googleTranslate(text, resolved);
    return _chatTranslate(text, resolved);
  }

  var FALLBACK_CHAIN = [
    { id: 'mymemory', fn: translateMyMemory, label: 'MyMemory' },
    { id: 'google-unofficial', fn: translateGoogleUnofficial, label: 'Google Translate (unofficial)' },
    { id: 'libretranslate', fn: translateLibreTranslate, label: 'LibreTranslate' },
    { id: 'apertium', fn: translateApertium, label: 'Apertium' }
  ];

  /**
   * Translate with automatic fallback through free APIs.
   * @param {string} text
   * @param {string} sourceLang
   * @param {string} targetLang
   * @param {Object} options - { onProgress, customApi, preferredProvider }
   * @returns {Promise<{text, provider}>}
   */
  function translate(text, sourceLang, targetLang, options) {
    var opts = options || {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};

    if (opts.customApi && opts.customApi.endpoint && opts.customApi.apiKey) {
      onProgress(20);
      return translateCustom(text, {
        provider: opts.customApi.provider,
        endpoint: opts.customApi.endpoint,
        apiKey: opts.customApi.apiKey,
        model: opts.customApi.model,
        sourceLang: sourceLang,
        targetLang: targetLang
      }).then(function (result) {
        onProgress(100);
        return { text: result, provider: 'custom:' + (opts.customApi.provider || 'unknown') };
      });
    }

    var chain = FALLBACK_CHAIN.slice();
    if (opts.preferredProvider) {
      chain.sort(function (a, b) {
        if (a.id === opts.preferredProvider) return -1;
        if (b.id === opts.preferredProvider) return 1;
        return 0;
      });
    }

    var tryNext = function (idx, lastError) {
      if (idx >= chain.length) {
        return Promise.reject(lastError || new Error('All translation providers failed'));
      }
      var provider = chain[idx];
      onProgress(20 + Math.floor((idx / chain.length) * 60));
      return provider.fn(text, sourceLang, targetLang).then(function (result) {
        onProgress(100);
        return { text: result, provider: provider.label };
      }).catch(function (err) {
        console.warn('[Ketor translator] ' + provider.label + ' failed:', err.message || err);
        return tryNext(idx + 1, err);
      });
    };

    return tryNext(0, null);
  }

  Ketor.core.translate = translate;
  Ketor.core.translateMyMemory = translateMyMemory;
  Ketor.core.translateGoogleUnofficial = translateGoogleUnofficial;
  Ketor.core.translateLibreTranslate = translateLibreTranslate;
  Ketor.core.translateApertium = translateApertium;
  Ketor.core.translateCustom = translateCustom;
  Ketor.core.TRANSLATOR_PROVIDERS = TRANSLATOR_PROVIDERS;
  Ketor.core.getTranslatorProvider = getProvider;
  Ketor.core.FALLBACK_CHAIN = FALLBACK_CHAIN;

})(window);