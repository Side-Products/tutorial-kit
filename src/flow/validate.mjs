import { assertIdentifier } from "../security/paths.mjs";
import { sameOriginUrl } from "../security/urls.mjs";

const TARGET_ACTIONS = new Set(["click", "fill", "hover", "waitFor"]);
const KINDS = new Set(["goto", ...TARGET_ACTIONS, "press", "scroll", "waitLong", "pause"]);

function string(value, label, max = 10000) {
	if (typeof value !== "string" || value.length > max)
		throw new Error(`${label} must be text of at most ${max} characters`);
}

export function validateTarget(target) {
	if (!target || typeof target !== "object" || Array.isArray(target))
		throw new Error("action needs a target object");
	const types = ["css", "role", "text"].filter((k) => target[k] !== undefined);
	if (types.length !== 1) throw new Error("target needs exactly one of css, role or text");
	string(target[types[0]], "target", 2000);
	if (!target[types[0]].trim()) throw new Error("target must not be empty");
	if (target.name !== undefined) string(target.name, "target.name", 2000);
	if (target.exact !== undefined && typeof target.exact !== "boolean")
		throw new Error("target.exact must be boolean");
	return target;
}

export function validateAction(action, baseUrl) {
	if (!action || !KINDS.has(action.kind)) throw new Error("unknown declarative action kind");
	if (TARGET_ACTIONS.has(action.kind) || (action.kind === "waitLong" && action.target))
		validateTarget(action.target);
	for (const key of ["redact", "noHeal"]) {
		if (action[key] !== undefined && typeof action[key] !== "boolean")
			throw new Error(`${key} must be boolean`);
	}
	if (action.kind === "goto") {
		string(action.path ?? action.url, "navigation path");
		if (baseUrl) sameOriginUrl(action.path ?? action.url, baseUrl);
	}
	if (["fill", "press"].includes(action.kind)) string(action.value ?? "", "action.value");
	if (action.label !== undefined) string(action.label, "action.label", 500);
	for (const [key, min, max] of [
		["px", -100000, 100000],
		["seconds", 0, 600],
		["timeoutSec", 0, 3600],
	]) {
		if (
			action[key] !== undefined &&
			(!Number.isFinite(action[key]) || action[key] < min || action[key] > max)
		) {
			throw new Error(`${key} must be a finite number between ${min} and ${max}`);
		}
	}
	return action;
}

export function validateFlow(flow, { baseUrl, declarativeOnly = false } = {}) {
	assertIdentifier(flow?.id, "flow.id");
	string(flow.title, "flow.title", 300);
	if (!flow.title.trim()) throw new Error("flow.title must not be empty");
	if (flow.goal !== undefined) string(flow.goal, "flow.goal", 2000);
	if (flow.auth !== undefined && typeof flow.auth !== "boolean") throw new Error("flow.auth must be boolean");
	if (!Array.isArray(flow.steps) || !flow.steps.length || flow.steps.length > 100)
		throw new Error("flow needs 1–100 steps");
	const ids = new Set();
	for (const [i, step] of flow.steps.entries()) {
		const id = assertIdentifier(step.id ?? `s${i + 1}`, "step.id");
		if (ids.has(id)) throw new Error(`duplicate step id: ${id}`);
		ids.add(id);
		if (step.say !== undefined) string(step.say, "step.say", 2000);
		if (step.run !== undefined && (declarativeOnly || typeof step.run !== "function"))
			throw new Error("step.run must be a trusted function");
		if (!step.run || declarativeOnly) {
			if (!Array.isArray(step.actions) || !step.actions.length || step.actions.length > 100)
				throw new Error("declarative steps need 1–100 actions");
			for (const action of step.actions) validateAction(action, baseUrl);
		}
	}
	return flow;
}

// A repair may only choose a locator; it cannot change the verb, typed value or privacy flags.
export function selectorRepair(action, proposed) {
	if (!TARGET_ACTIONS.has(action.kind) || action.redact || action.noHeal || proposed?.kind !== action.kind)
		return null;
	try {
		validateTarget(proposed.target);
		return { ...action, target: proposed.target };
	} catch {
		return null;
	}
}
