'use strict';
// Define references to DOM elements
const color1 = document.getElementById('color1');
const color2 = document.getElementById('color2');
const color_text = document.getElementById('color_text');
const gradient_size = document.getElementById('gradient_size');
const enabled = document.getElementById('enabled');
const use_font_weight = document.getElementById('use_font_weight');
const auto_add = document.getElementById('auto_add');
const auto_list = document.getElementById('auto_list');
const apply_scope = document.getElementById('apply_scope');

// Listen for clicks on the input elements, and send the appropriate message
// to the content script in the page.
function eventHandler(e) {
	// Send message to content script to color lines
	function apply_gradient(tabs) {
		if (!tabs || tabs.length === 0) {
			console.warn('Hornet Reader: no active tab to apply gradient');
			return;
		}

    const weightOn = use_font_weight && use_font_weight.checked;
    const gradientOn = enabled && enabled.checked;

    getActiveHost((host) => {
        chrome.storage.local.get({ auto_domains: [] }, (data) => {
            const auto = Array.isArray(data.auto_domains) && host ? data.auto_domains.indexOf(host) !== -1 : false;
            if (gradientOn && auto) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    command: "apply_gradient",
                    colors: [color1.value, color2.value],
                    color_text: color_text.value,
                    gradient_size: gradient_size.value
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('Hornet Reader: unable to apply gradient', chrome.runtime.lastError);
                    }
                    if (weightOn) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            command: "apply_weight",
                            preserveColor: true
                        }, () => {
                            if (chrome.runtime.lastError) {
                                console.warn('Hornet Reader: unable to apply weight', chrome.runtime.lastError);
                            }
                        });
                    }
                });
            } else if (weightOn) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    command: "apply_weight",
                    preserveColor: false
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('Hornet Reader: unable to apply weight', chrome.runtime.lastError);
                    }
                });
            } else {
                chrome.tabs.sendMessage(tabs[0].id, {
                    command: "reset",
                    color_text: color_text.value
                }, () => {
                    if (chrome.runtime.lastError) {
                        // ignore
                    }
                });
            }
        });
    });
	}

	// Send message to content script to reset lines
	function reset(tabs) {
		if (!tabs || tabs.length === 0) {
			console.warn('Hornet Reader: no active tab to reset');
			return;
		}

		chrome.tabs.sendMessage(tabs[0].id, {
			command: "reset",
			color_text: color_text.value
		}, () => {
			if (chrome.runtime.lastError) {
				console.warn('Hornet Reader: unable to reset', chrome.runtime.lastError);
			}
		});
	}

	// Store attributes into local storage
    chrome.storage.local.set({
        color1: color1.value,
        color2: color2.value,
        color_text: color_text.value,
        gradient_size: gradient_size.value,
        enabled: enabled.checked,
        use_font_weight: use_font_weight && use_font_weight.checked,
        apply_scope: apply_scope ? apply_scope.value : 'auto'
    });

    getActiveHost((host) => {
        if (!host) return;
        chrome.storage.local.get({ auto_domains: [] }, (data) => {
            const list = Array.isArray(data.auto_domains) ? data.auto_domains : [];
            if (list.indexOf(host) !== -1) {
                const overrides = {
                    color1: color1.value,
                    color2: color2.value,
                    color_text: color_text.value,
                    gradient_size: gradient_size.value,
                    use_font_weight: use_font_weight && use_font_weight.checked
                };
                chrome.runtime.sendMessage({ command: 'save_site_overrides', host, overrides }, () => {});
            }
        });
    });

	// Dispatch depending on checkbox enabled state
	if (enabled.checked || (use_font_weight && use_font_weight.checked)) {
		chrome.tabs.query({ active: true, currentWindow: true }, apply_gradient);
	} else {
		chrome.tabs.query({ active: true, currentWindow: true }, reset);
	}
}

// Load settings from local storage, or use these defaults
chrome.storage.local.get({
    color1: "#0000FF",
    color2: "#FF0000",
    color_text: "#000000",
    gradient_size: 50,
    enabled: false,
    use_font_weight: false,
    apply_scope: 'auto',
    auto_domains: [],
    site_overrides: {}
}, function(result) {
	color1.value = result.color1;
	color2.value = result.color2;
	color_text.value = result.color_text;
	gradient_size.value = result.gradient_size;
	enabled.checked = result.enabled;
    if (use_font_weight) {
        use_font_weight.checked = Boolean(result.use_font_weight);
    }
    if (apply_scope) {
        apply_scope.value = result.apply_scope || 'auto';
    }
    renderAutoList(result.auto_domains || []);

    getActiveHost((host) => {
        if (!host) return;
        const map = result.site_overrides || {};
        const overrides = map[host];
        if (!overrides) return;
        if (typeof overrides.color1 === 'string') color1.value = overrides.color1;
        if (typeof overrides.color2 === 'string') color2.value = overrides.color2;
        if (typeof overrides.color_text === 'string') color_text.value = overrides.color_text;
        if (typeof overrides.gradient_size !== 'undefined') gradient_size.value = overrides.gradient_size;
        if (use_font_weight && typeof overrides.use_font_weight !== 'undefined') {
            use_font_weight.checked = !!overrides.use_font_weight;
        }
    });
})

// Register event listeners to update page when options change
document.getElementById("enabled").addEventListener("change", eventHandler);
document.getElementById("use_font_weight").addEventListener("change", eventHandler);
if (apply_scope) { apply_scope.addEventListener("change", eventHandler); }
document.getElementById("gradient_size").addEventListener("input", eventHandler);
document.getElementById("color1").addEventListener("input", eventHandler);
document.getElementById("color2").addEventListener("input", eventHandler);
document.getElementById("color_text").addEventListener("input", eventHandler);

function getHostname(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return '';
    }
}

function getActiveHost(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].url) {
            callback('');
            return;
        }
        const host = getHostname(tabs[0].url).toLowerCase();
        callback(host);
    });
}

function addCurrentDomainToAutoList() {
    getActiveHost((host) => {
        if (!host) return;
        const overrides = {
            color1: color1.value,
            color2: color2.value,
            color_text: color_text.value,
            gradient_size: gradient_size.value,
            use_font_weight: use_font_weight && use_font_weight.checked
        };
        chrome.storage.local.get({ auto_domains: [] }, (data) => {
            const list = Array.isArray(data.auto_domains) ? data.auto_domains.slice() : [];
            if (list.indexOf(host) === -1) {
                list.push(host);
                chrome.storage.local.set({ auto_domains: list }, () => {
                    chrome.runtime.sendMessage({ command: 'save_site_overrides', host, overrides }, () => {});
                    renderAutoList(list);
                });
            }
        });
    });
}

if (auto_add) {
    auto_add.addEventListener('click', addCurrentDomainToAutoList);
}

function renderAutoList(list) {
    if (!auto_list) return;
    auto_list.innerHTML = '';
    (Array.isArray(list) ? list : []).forEach((domain, index) => {
        const li = document.createElement('li');
        const txt = document.createElement('span');
        txt.textContent = domain;
        const rm = document.createElement('button');
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => removeDomainAt(index));
        li.appendChild(txt);
        li.appendChild(rm);
        auto_list.appendChild(li);
    });
}

function removeDomainAt(index) {
    chrome.storage.local.get({ auto_domains: [] }, (data) => {
        const list = Array.isArray(data.auto_domains) ? data.auto_domains.slice() : [];
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            chrome.storage.local.set({ auto_domains: list }, () => renderAutoList(list));
        }
    });
}

function refreshList() {
    chrome.storage.local.get({ auto_domains: [] }, (data) => {
        renderAutoList(data.auto_domains || []);
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes && changes.auto_domains) {
        renderAutoList(changes.auto_domains.newValue || []);
    }
});