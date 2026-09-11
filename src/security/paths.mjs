import fs from "node:fs";
import path from "node:path";

export function assertIdentifier(value, label = "id") {
	if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) {
		throw new Error(
			`${label} must be 1–80 letters, numbers, hyphens or underscores, starting with a letter or number`,
		);
	}
	return value;
}

// Artifacts may supply filenames, but must never choose files outside their stage directory.
export function pathInside(root, relative) {
	if (
		typeof relative !== "string" ||
		!relative ||
		/[\\\x00-\x1f\x7f]/.test(relative) ||
		path.isAbsolute(relative)
	) {
		throw new Error("artifact path must be a relative path without control characters or backslashes");
	}
	const base = path.resolve(root);
	const target = path.resolve(base, relative);
	const rel = path.relative(base, target);
	if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
		throw new Error("artifact path must stay inside its directory");
	}
	let current = base;
	for (const part of ["", ...rel.split(path.sep)]) {
		current = path.join(current, part);
		try {
			if (fs.lstatSync(current).isSymbolicLink())
				throw new Error("artifact paths must not contain symbolic links");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	return target;
}
