export default {
	baseUrl: "https://www.faceless.so",
	canonicalHost: "faceless.so",
	// Real tutorials use the demo team: set TUTORIAL_EMAIL / TUTORIAL_PASSWORD and uncomment.
	// auth: { loginPath: "/login", emailEnv: "TUTORIAL_EMAIL", passwordEnv: "TUTORIAL_PASSWORD" },
	auth: null,
	brand: {
		name: "Faceless",
		colors: { bg: "#0B0713", accent: "#8B5CF6", text: "#FFFFFF" },
	},
	// Routes the plan scout may visit when drafting a new flow from plain English.
	sitemap: [
		{ path: "/", purpose: "marketing homepage: what Faceless does" },
		{ path: "/pricing", purpose: "plans, monthly/yearly billing toggle, FAQ" },
		{ path: "/tutorials", purpose: "video tutorials library" },
		{ path: "/developers", purpose: "API and developer docs landing" },
	],
	// Julian: the narrator voice faceless already ships for longform. Swap freely.
	voice: {
		id: "5PEXwsADjqmz7GO58o3B",
		model: "eleven_turbo_v2_5",
		settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
		pronunciations: { "Faceless.so": "Faceless dot so" },
	},
};
