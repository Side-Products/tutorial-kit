// Copy hygiene, enforced mechanically: no em dashes ever, no AI-tell phrasing.
const BANNED = [
	/\blet'?s dive\b/i,
	/\bdive (in|into|right in)\b/i,
	/\bseamless(ly)?\b/i,
	/\bsupercharge\b/i,
	/\bunleash\b/i,
	/\bgame.?chang\w*/i,
	/\bwelcome back\b/i,
	/\bin (today'?s|this) video\b/i,
	/\bwithout further ado\b/i,
	/\bbuckle up\b/i,
	/\brevolutioniz\w*/i,
	/\beffortless(ly)?\b/i,
	/\belevate\b/i,
	/\bempower\w*/i,
	/\bthe best part\?/i,
	/\bsit back and relax\b/i,
];

export function normalizeCopy(text) {
	let t = String(text);
	t = t.replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2"); // numeric ranges
	t = t.replace(/\s*[–—]\s*/g, ", "); // remaining en/em dashes become a comma pause
	t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
	t = t.replace(/\s{2,}/g, " ").trim();
	return t;
}

export function copyViolations(text) {
	return BANNED.filter((re) => re.test(text)).map((re) => re.source);
}
