// Smoke flow on public pages: exercises goto, scroll, hover, click, pause + the event log.
export default {
	id: "site-tour",
	title: "A quick tour of Faceless",
	goal: "Show what Faceless does and where pricing lives",
	auth: false,
	steps: [
		{
			id: "home",
			say: "Faceless creates and posts niche videos for you on autopilot",
			run: async (t) => {
				await t.goto("/");
				await t.pause(1.6);
			},
		},
		{
			id: "features",
			say: "Scroll through what the platform does end to end",
			run: async (t) => {
				await t.scrollBy(1500, { label: "feature highlights" });
				await t.pause(1.2);
			},
		},
		{
			id: "pricing",
			say: "Open the pricing page to pick a plan",
			run: async (t) => {
				await t.goto("/pricing");
				await t.pause(1.2);
			},
		},
		{
			id: "billing-toggle",
			say: "Switch between monthly and yearly billing to see the discount",
			run: async (t) => {
				const yearly = t.page.getByText(/^yearly$/i).first();
				if (await yearly.isVisible().catch(() => false)) {
					await t.click(yearly);
					await t.pause(1.0);
					const monthly = t.page.getByText(/^monthly$/i).first();
					if (await monthly.isVisible().catch(() => false)) await t.click(monthly);
				} else {
					await t.scrollBy(700, { label: "plans" });
				}
				await t.pause(1.0);
			},
		},
		{
			id: "faq",
			say: "Answers to common questions live at the bottom",
			run: async (t) => {
				const faq = t.page.getByText(/frequently asked/i).first();
				if ((await faq.isVisible().catch(() => false)) || (await faq.count())) {
					await t.scrollIntoView(faq);
					await t.pause(1.4);
				} else {
					await t.scrollBy(1200, { label: "faq" });
				}
			},
		},
	],
};
