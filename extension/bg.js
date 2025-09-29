'use strict';

const DEFAULT_SETTINGS = {
	color1: '#0000FF',
	color2: '#FF0000',
	color_text: '#000000',
	gradient_size: 50,
	enabled: false
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

function injectAndMaybeApply(tabId, settings) {
	chrome.scripting.executeScript({
		target: { tabId },
		files: ['contentScript.js']
	}, () => {
		if (chrome.runtime.lastError) {
			console.warn('WaspLine: failed to inject content script', chrome.runtime.lastError);
			return;
		}

		if (!settings.enabled) {
			return;
		}

		chrome.tabs.sendMessage(tabId, {
			command: 'apply_gradient',
			colors: [settings.color1, settings.color2],
			color_text: settings.color_text,
			gradient_size: settings.gradient_size
		}, () => {
			if (chrome.runtime.lastError) {
				console.warn('WaspLine: failed to send message', chrome.runtime.lastError);
			}
		});
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
		injectAndMaybeApply(tabId, settings);
	});
});