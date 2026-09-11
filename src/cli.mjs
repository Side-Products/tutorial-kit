import { parseArgs } from "node:util";
import { loadConfig } from "./config.mjs";
import { loadFlows, resolveSelection } from "./flow/loader.mjs";

const HELP = `tutorials-kit: automated product tutorial pipeline

Usage: tutorials-kit <command> [flowId...] [options]

Flow references: an exact flow id, or plain English ("record the billing tutorial").

Commands:
  list                 List flows found in the config's flows dir
  plan "<request>"     Match the request to a flow, or scout the live app and draft a new flow file
                       (--yes records the draft immediately; --new skips matching)
  record [flow...]     Drive the app and capture frames + events (all flows if none given)
  script [flow...]     Generate editable narration script.md from the capture
  voice [flow...]      Synthesize per-block voiceover with word timestamps (ElevenLabs)
  compose [flow...]    Solve the timeline: mezzanine + zooms + cursor + mixed audio + timeline.json
  render [flow...]     Render locally (proof 1080p by default; --final for 4K + 1080p delivery)
  docs [flow...]       Emit guide.md, tutorial.json, captions.vtt, chapters.txt, publish snippets
  build [flow...]      All stages with caching (--force <stage> reruns from that stage; --final)
  check [flow...]      Run flows headless with no recording; exit 1 on UI drift/failures
  clean [flow...]      Delete captured frames (--all wipes the flow's whole out dir)

Options:
  --config <path>      Path to tutorials.config.mjs (default: ./tutorials.config.mjs)
  --headed             Run the capture browser headed (debugging; window may be clamped by screen size)
  --no-captions        Render a separate copy without burned-in captions for editing in Faceless or another editor
`;

export async function main(argv) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			config: { type: "string" },
			headed: { type: "boolean", default: false },
			final: { type: "boolean", default: false },
			force: { type: "string" },
			all: { type: "boolean", default: false },
			yes: { type: "boolean", default: false },
			new: { type: "boolean", default: false },
			"no-captions": { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
	});
	const [command, ...ids] = positionals;
	if (!command || values.help) {
		console.log(HELP);
		return;
	}
	if (values["no-captions"] && command !== "render") {
		throw new Error("--no-captions is only supported by render; export a separate copy after build");
	}
	const config = await loadConfig(values.config);
	const flows = await loadFlows(config);

	if (command === "list") {
		if (!flows.length) console.log(`no flows in ${config.flowsDirAbs}`);
		for (const f of flows) console.log(`${f.id}  -  ${f.title} (${f.steps.length} steps)`);
		return;
	}
	if (command === "plan") {
		const { planCommand } = await import("./plan/scout.mjs");
		if (!ids.length) throw new Error(`plan needs a request, e.g.: tutorials-kit plan "how do I buy credits"`);
		await planCommand(ids.join(" "), config, {
			yes: values.yes,
			headed: values.headed,
			forceNew: values.new,
		});
		return;
	}
	if (command === "record") {
		const { recordFlow } = await import("./capture/record.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) {
			await recordFlow(flow, config, { headed: values.headed });
		}
		return;
	}
	if (command === "script") {
		const { generateScript } = await import("./script/generate.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) await generateScript(flow, config);
		return;
	}
	if (command === "voice") {
		const { runVoice } = await import("./voice/narrate.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) await runVoice(flow, config);
		return;
	}
	if (command === "compose") {
		const { composeFlow } = await import("./compose/run.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) await composeFlow(flow, config);
		return;
	}
	if (command === "render") {
		const { renderFlow } = await import("./render/render.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) {
			await renderFlow(flow, config, {
				mode: values.final ? "final" : "proof",
				captions: !values["no-captions"],
			});
		}
		return;
	}
	if (command === "docs") {
		const { buildDocs } = await import("./docs/build.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) await buildDocs(flow, config);
		return;
	}
	if (command === "build") {
		const { buildFlow } = await import("./stages.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) {
			await buildFlow(flow, config, {
				force: values.force === "" ? "all" : values.force || null,
				mode: values.final ? "final" : "proof",
				headed: values.headed,
			});
		}
		return;
	}
	if (command === "check") {
		const { checkFlows } = await import("./check/run.mjs");
		const results = await checkFlows(await resolveSelection(flows, ids, config), config);
		const failed = results.filter((r) => !r.ok);
		console.log(`check: ${results.length - failed.length}/${results.length} flows pass`);
		if (failed.length) process.exit(1);
		return;
	}
	if (command === "clean") {
		const fs = await import("node:fs");
		const path = await import("node:path");
		const { flowOutDir } = await import("./config.mjs");
		for (const flow of await resolveSelection(flows, ids, config)) {
			const target = values.all
				? flowOutDir(config, flow.id)
				: path.join(flowOutDir(config, flow.id), "capture", "frames");
			fs.rmSync(target, { recursive: true, force: true });
			console.log(`cleaned ${target}`);
		}
		return;
	}
	throw new Error(`unknown command "${command}"\n${HELP}`);
}
