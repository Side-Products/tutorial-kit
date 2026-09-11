export function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

// Treat page labels and generated narration as text, not executable HTML or Markdown links.
export function markdownText(value) {
	return escapeHtml(value)
		.replace(/\r?\n/g, " ")
		.replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&");
}

export function inlineCode(value) {
	const text = String(value ?? "").replace(/[\r\n]/g, " ");
	const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
	const fence = "`".repeat(longest + 1);
	return `${fence} ${text} ${fence}`;
}
