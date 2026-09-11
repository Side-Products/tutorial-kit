export default {
	baseUrl: "https://demo.example.com",
	canonicalHost: "demo.example.com",
	flowsDir: "flows",
	outDir: "out",
	browserChannel: "chrome", // null uses Playwright's bundled Chromium
	viewport: { width: 1920, height: 1080, dsf: 2 },
	auth: null,
	// auth: { loginPath: "/login", emailEnv: "TUTORIAL_EMAIL", passwordEnv: "TUTORIAL_PASSWORD" },
	selfHeal: false, // opt in only for trusted demo data; snapshots are sent to the LLM
	brand: {
		name: "Your Product",
		colors: { bg: "#0B0B10", accent: "#8B5CF6", text: "#FFFFFF" },
		// logo: "assets/logo.png",
	},
	sitemap: [
		{ path: "/", purpose: "demo homepage" },
		{ path: "/projects", purpose: "project workspace" },
	],
	voice: {
		id: process.env.ELEVENLABS_VOICE_ID,
		model: "eleven_turbo_v2_5",
		settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
	},
	// music: { track: "assets/music.mp3", gainDb: -24 },
};
