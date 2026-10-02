'use strict';
const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function highlightCSS(src) {
		const re =
			/(\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[-\w\u0080-\uFFFF]+)|(#[0-9a-fA-F]{3,8}\b)|(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|ch|ex|pt|pc|in|cm|mm)?\b)|([-\w\u0080-\uFFFF]+)(?=\s*:)|([-\w\u0080-\uFFFF]+)(?=\s*[,{}])|([{};])/g;
		let out = '';
		let last = 0;
		let parens = 0;
		let m;
		while ((m = re.exec(src))) {
			for (let i = last; i < m.index; i++) {
				const ch = src[i];
				if (ch === '(') parens++;
				else if (ch === ')') parens--;
			}
			out += escapeHtml(src.slice(last, m.index));
			let cls;
			if (m[1]) cls = 'se-tok-comment';
			else if (m[2]) cls = 'se-tok-string';
			else if (m[3]) cls = 'se-tok-keyword';
			else if (m[4] || m[5]) cls = 'se-tok-value';
			else if (m[8]) cls = 'se-tok-punct';
			else if (m[7]) cls = 'se-tok-selector';
			else {
				const stop = src.slice(m.index + m[0].length).search(/[{};]/);
				const isDecl = parens > 0 || stop === -1 || src[m.index + m[0].length + stop] !== '{';
				cls = isDecl ? 'se-tok-property' : 'se-tok-selector';
			}
			out += '<span class="' + cls + '">' + escapeHtml(m[0]) + '</span>';
			last = m.index + m[0].length;
			if (m[0].length === 0) re.lastIndex++;
		}
		out += escapeHtml(src.slice(last));
		out += '\n';
		return out;
	}

module.exports = {highlightCSS};
