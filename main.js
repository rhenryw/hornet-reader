(function() {
'use strict';

if (window.__waspLineInitialized) {
	return;
}
window.__waspLineInitialized = true;

// Linear interpolate between v0 and v1 at percent t
function lerp(v0, v1, t)
{
	return v0 * (1 - t) + v1 * t
}

// Convert a hex triplet (#XXXXXX) to an array containing red, green, and blue
function hex_to_rgb(hex)
{
	return hex.replace('#', '').match(/.{1,2}/g).map(
		x => parseInt(x, 16)
	);
}

function css_color_to_rgb_array(color)
{
	if (!color) {
		return [0, 0, 0];
	}
	const hex = /^#([0-9a-fA-F]{6})$/;
	if (hex.test(color)) {
		return hex_to_rgb(color);
	}
	const rgbm = color.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (rgbm) {
		return [parseInt(rgbm[1], 10), parseInt(rgbm[2], 10), parseInt(rgbm[3], 10)];
	}
	const div = document.createElement('div');
	div.style.display = 'none';
	div.style.color = color;
	document.documentElement.appendChild(div);
	const computed = getComputedStyle(div).color;
	const m = computed.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
	if (div.parentNode) div.parentNode.removeChild(div);
	if (m) {
		return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
	}
	return [0, 0, 0];
}

function get_default_text_color()
{
	const root = document.body || document.documentElement;
	const c = getComputedStyle(root).color;
	return c || '#000000';
}

// Color all lines in the page
function applyGradient(colors, color_text, gradient_size)
{
	const paragraphs = document.getElementsByTagName('p');
	const base_color = css_color_to_rgb_array(get_default_text_color());
	let coloridx = 0;
	let lineno = 0;

	for (let paragraph of paragraphs) {
		const lines = lineWrapDetector.getLines(paragraph);

		for (let line of lines) {
			// Alternate between left and right for every color
			const active_color = hex_to_rgb(colors[coloridx]);

			// Flip array around if on left to color correctly
			const is_left = (lineno % 2 === 0);
			if(is_left) {
				line = Array.from(line).reverse();
			}

			// Color lines using lerp of RGB values
			for (let loc in line) {
				const t = 1 - (loc / (line.length * gradient_size / 50));
				const red = lerp(base_color[0], active_color[0], t);
				const green = lerp(base_color[1], active_color[1], t);
				const blue = lerp(base_color[2], active_color[2], t);

				line[loc].style.color = "rgb(" + (red|0) + "," + (green|0) + "," + (blue|0) + ")";
			}

			// Increment color index after every left/right pair, and lineno
			// after every line
			if (!is_left) {
				coloridx = (coloridx + 1) % colors.length;
			}
			lineno += 1;
		}
	}
}

function applyFontWeight(preserveColor)
{
	const paragraphs = document.getElementsByTagName('p');
	let lineno = 0;
	for (let paragraph of paragraphs) {
		const lines = lineWrapDetector.getLines(paragraph);
		for (let line of lines) {
			const isEven = (lineno % 2 === 0);
			for (let loc in line) {
				if (!preserveColor) {
					line[loc].style.color = '';
				}
				line[loc].style.fontWeight = isEven ? '600' : '400';
			}
			lineno += 1;
		}
	}
}

function showAutoDomainPrompt(host)
{
	const existing = document.getElementById('waspline-auto-prompt');
	if (existing) {
		return;
	}
	const wrapper = document.createElement('div');
	wrapper.id = 'waspline-auto-prompt';
	wrapper.style.position = 'fixed';
	wrapper.style.left = '12px';
	wrapper.style.bottom = '12px';
	wrapper.style.zIndex = '2147483647';
	wrapper.style.background = 'rgba(20,20,20,0.92)';
	wrapper.style.color = '#fff';
	wrapper.style.padding = '10px 12px';
	wrapper.style.borderRadius = '8px';
	wrapper.style.boxShadow = '0 6px 20px rgba(0,0,0,0.25)';
	wrapper.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', Arial, sans-serif";
	wrapper.style.fontSize = '13px';
	const text = document.createElement('span');
	text.textContent = 'Add this site to auto domain list?';
	text.style.marginRight = '10px';
	const yes = document.createElement('button');
	yes.textContent = 'Yes';
	yes.style.marginRight = '6px';
	yes.style.background = '#4caf50';
	yes.style.color = '#fff';
	yes.style.border = 'none';
	yes.style.padding = '6px 10px';
	yes.style.borderRadius = '6px';
	yes.style.cursor = 'pointer';
	const no = document.createElement('button');
	no.textContent = 'No';
	no.style.background = '#9e9e9e';
	no.style.color = '#fff';
	no.style.border = 'none';
	no.style.padding = '6px 10px';
	no.style.borderRadius = '6px';
	no.style.cursor = 'pointer';
	wrapper.appendChild(text);
	wrapper.appendChild(yes);
	wrapper.appendChild(no);
	document.documentElement.appendChild(wrapper);
	let dismissed = false;
	function removePrompt() {
		if (dismissed) return;
		dismissed = true;
		if (wrapper && wrapper.parentNode) {
			wrapper.parentNode.removeChild(wrapper);
		}
	}
	const t = setTimeout(removePrompt, 3000);
	yes.addEventListener('click', function() {
		clearTimeout(t);
		chrome.runtime.sendMessage({ command: 'add_auto_domain', host: host || window.location.hostname }, function() {});
		removePrompt();
	});
	no.addEventListener('click', function() {
		clearTimeout(t);
		removePrompt();
	});
}

// Listen for messages in background script
chrome.runtime.onMessage.addListener((message) => {
	if (message.command === "apply_gradient") {
		applyGradient(
			message.colors, message.color_text, message.gradient_size
		);
	} else if (message.command === "apply_weight") {
		applyFontWeight(Boolean(message.preserveColor));
	} else if (message.command === 'prompt_add_domain') {
		showAutoDomainPrompt(message.host);
	} else if (message.command === "reset") {
		// TODO: Make function to remove line detection spans
		applyGradient(
			[message.color_text], message.color_text, 0
		);
	}
});


})();