'use strict';

const DEFAULT_SETTINGS = {
	color1: '#0000FF',
	color2: '#FF0000',
	color_text: '#000000',
	gradient_size: 50,
	enabled: false,
	use_font_weight: false,
	apply_scope: 'auto',
	auto_domains: [],
	site_overrides: {}
};

function isSupportedUrl(url) {
	return typeof url === 'string' && /^https?:\/\//.test(url);
}

function ensureDefaults() {
	chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
		const update = {};
		Object.keys(DEFAULT_SETTINGS).forEach((key) => {
			if (typeof settings[key] === 'undefined') {
				update[key] = DEFAULT_SETTINGS[key];
			}
		});
		if (Object.keys(update).length > 0) {
			chrome.storage.local.set(update);
		}
	});
}

function getHostnameFromUrl(url) {
	try {
		const u = new URL(url);
		return u.hostname || '';
	} catch (e) {
		return '';
	}
}

function isDomainMatch(host, domain) {
	if (!host || !domain) {
		return false;
	}
	if (host === domain) {
		return true;
	}
	return host.endsWith('.' + domain);
}

function shouldAutoApply(url, autoDomains) {
	const host = getHostnameFromUrl(url);
	if (!host || !Array.isArray(autoDomains)) {
		return false;
	}
	for (let i = 0; i < autoDomains.length; i++) {
		if (isDomainMatch(host, String(autoDomains[i] || '').toLowerCase())) {
			return true;
		}
	}
	return false;
}

function getOverridesForUrl(url, overridesMap) {
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (!host || !overridesMap) return null;
		let best = null;
		for (const key in overridesMap) {
			if (!Object.prototype.hasOwnProperty.call(overridesMap, key)) continue;
			const domain = String(key || '').toLowerCase();
			if (isDomainMatch(host, domain)) {
				best = overridesMap[key];
			}
		}
		return best;
	} catch (e) {
		return null;
	}
}

function injectContentScript(tabId, onDone) {
    try {
        if (chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
            chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Hornet Reader: failed to inject content script', chrome.runtime.lastError);
                    onDone(false);
                    return;
                }
                onDone(true);
            });
            return;
        }
    } catch (e) {}
    try {
        chrome.tabs.executeScript(tabId, { file: 'contentScript.js' }, () => {
            if (chrome.runtime.lastError) {
                console.warn('Hornet Reader: failed to inject via tabs.executeScript', chrome.runtime.lastError);
                onDone(false);
                return;
            }
            onDone(true);
        });
    } catch (e) {
        console.warn('Hornet Reader: injection error', e);
        onDone(false);
    }
}

function injectAndMaybeApply(tabId, settings, tabUrl) {
    injectContentScript(tabId, (ok) => {
        if (!ok) {
            return;
        }

        const autoApply = shouldAutoApply(tabUrl, settings.auto_domains);
        const scopeAll = settings.apply_scope === 'all';
        const doApply = Boolean(settings.use_font_weight || autoApply || scopeAll);
		if (!doApply) {
			return;
		}

		const overrides = getOverridesForUrl(tabUrl, settings.site_overrides);
		const effective = Object.assign({}, settings, overrides || {});


        const applyGradient = Boolean((scopeAll || autoApply) && effective.enabled);
        const applyWeight = Boolean((scopeAll || autoApply) && effective.use_font_weight) || Boolean(!effective.enabled && effective.use_font_weight);

        if (applyGradient) {
            chrome.tabs.sendMessage(tabId, {
                command: 'apply_gradient',
                colors: [effective.color1, effective.color2],
                color_text: effective.color_text,
                gradient_size: effective.gradient_size
            }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Hornet Reader: failed to send gradient message', chrome.runtime.lastError);
                }
                if (applyWeight) {
                    chrome.tabs.sendMessage(tabId, {
                        command: 'apply_weight',
                        preserveColor: true
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('Hornet Reader: failed to send weight message', chrome.runtime.lastError);
                        }
                    });
                }
            });
        } else if (applyWeight) {
            chrome.tabs.sendMessage(tabId, {
                command: 'apply_weight',
                preserveColor: false
            }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('Hornet Reader: failed to send weight message', chrome.runtime.lastError);
                }
            });
        }
    });
}

chrome.runtime.onInstalled.addListener(ensureDefaults);
if (chrome.runtime.onStartup && typeof chrome.runtime.onStartup.addListener === 'function') {
	chrome.runtime.onStartup.addListener(ensureDefaults);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status !== 'complete' || !tab || !isSupportedUrl(tab.url)) {
		return;
	}

	chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
		const auto = shouldAutoApply(tab.url, settings.auto_domains);
		injectAndMaybeApply(tabId, settings, tab.url);
		if (settings.apply_scope === 'auto' && !auto) {
			chrome.tabs.sendMessage(tabId, {
				command: 'prompt_add_domain',
				host: getHostnameFromUrl(tab.url)
			}, () => {
				if (chrome.runtime.lastError) {}
			});
		}
	});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message && message.command === 'add_auto_domain') {
		chrome.storage.local.get({ auto_domains: [] }, (data) => {
			const list = Array.isArray(data.auto_domains) ? data.auto_domains.slice() : [];
			const host = String(message.host || '').toLowerCase();
			if (host && list.indexOf(host) === -1) {
				list.push(host);
				chrome.storage.local.set({ auto_domains: list }, () => sendResponse({ ok: true }));
				return;
			}
			sendResponse({ ok: true });
		});
		return true;
	} else if (message && message.command === 'save_site_overrides') {
		const host = String(message.host || '').toLowerCase();
		if (!host) { sendResponse({ ok: false }); return; }
		chrome.storage.local.get({ site_overrides: {} }, (data) => {
			const map = data.site_overrides || {};
			map[host] = Object.assign({}, map[host] || {}, message.overrides || {});
			chrome.storage.local.set({ site_overrides: map }, () => sendResponse({ ok: true }));
		});
		return true;
	}
});