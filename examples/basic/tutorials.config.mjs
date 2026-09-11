export default {
	baseUrl: "http://127.0.0.1:4000",
	canonicalHost: "demo.example.com",
	browserChannel: null,
	auth: null,
	selfHeal: false,
	allowLeakage: true, // this fixture intentionally records a loopback URL
	brand: {
		name: "Tutorial Kit",
		colors: { bg: "#141020", accent: "#A78BFA", text: "#FFFFFF" },
	},
	sitemap: [{ path: "/", purpose: "sample project workspace" }],
	voice: {
		id: process.env.ELEVENLABS_VOICE_ID,
		model: "eleven_turbo_v2_5",
	},
};
