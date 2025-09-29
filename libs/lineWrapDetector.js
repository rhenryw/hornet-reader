(function () {
	'use strict';

	function wrapWords(text, before, after, join) {
		const delimiter = join || '';
		return text.split('').map((word) => `${before}${word}${after}`).join(delimiter);
	}

	function wrapWordsInChildElement(node) {
		if (node.nodeName === '#text') {
			const characters = node.textContent.split('');

			for (let i = 0; i < characters.length; i += 1) {
				const char = characters[i];
				if (char.length > 0) {
					const span = node.ownerDocument.createElement('span');
					span.className = 'js-detect-wrap';
					span.innerText = char;
					node.parentNode.insertBefore(span, node);
				}
			}

			node.parentNode.removeChild(node);
		} else if (node.innerText) {
			node.innerHTML = wrapWords(node.innerText, '<span class="js-detect-wrap">', '</span>');
		}
	}

	function wrapWordsInElement(node) {
		if (!node.firstChild) {
			wrapWordsInChildElement(node);
			return;
		}

		const siblings = [];
		let pointer = node.firstChild;
		do {
			siblings.push(pointer);
			pointer = pointer.nextSibling;
		} while (pointer);

		for (let i = 0; i < siblings.length; i += 1) {
			wrapWordsInElement(siblings[i]);
		}
	}

	function getLines(element) {
		wrapWordsInElement(element);

		const spans = element.getElementsByClassName('js-detect-wrap');
		const lines = [];
		let currentLine = [];
		let lastOffset = 0;

		for (let i = 0; i < spans.length; i += 1) {
			const span = spans[i];
			const offset = span.offsetTop + span.getBoundingClientRect().height;

			if (offset === lastOffset) {
				currentLine.push(span);
			} else {
				if (currentLine.length > 0) {
					lines.push(currentLine);
				}

				currentLine = [span];
			}

			lastOffset = offset;
		}

		if (currentLine.length > 0) {
			lines.push(currentLine);
		}

		return lines;
	}

	const detector = {
		wrapWords,
		wrapWordsInElement,
		wrapWordsInChildElement,
		getLines
	};

	if (typeof define === 'function' && define.amd) {
		define(() => detector);
	} else if (typeof module !== 'undefined' && module.exports) {
		module.exports = detector;
	} else {
		window.lineWrapDetector = detector;
	}
})();
