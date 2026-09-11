export default {
	id: "hello-world",
	title: "Create a sample project",
	goal: "Record a complete workflow on a local demo",
	auth: false,
	steps: [
		{
			id: "open-workspace",
			say: "Open the demo workspace to see your projects.",
			actions: [
				{ kind: "goto", path: "/" },
				{ kind: "pause", seconds: 1.2 },
			],
		},
		{
			id: "create-project",
			say: "Create a sample project. The confirmation appears below the button.",
			actions: [
				{ kind: "click", target: { role: "button", name: "Create sample project", exact: true } },
				{ kind: "waitFor", target: { text: "Sample project created.", exact: false }, noHeal: true },
				{ kind: "pause", seconds: 1.2 },
			],
		},
	],
};
