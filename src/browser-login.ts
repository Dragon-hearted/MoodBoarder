import { createInterface } from "node:readline";
import { type Browser, type BrowserContext, chromium } from "playwright";
import { isSessionPotentiallyValid, loadSession, saveSession } from "./session";

const PINTEREST_URL = "https://www.pinterest.com/";
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface BrowserLoginOptions {
	headless?: boolean;
	cookiesPath?: string;
	timeout?: number;
}

function waitForEnter(prompt: string): Promise<void> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(prompt, () => {
			rl.close();
			resolve();
		});
	});
}

export class BrowserLogin {
	private options: Required<BrowserLoginOptions>;

	constructor(options?: BrowserLoginOptions) {
		this.options = {
			headless: options?.headless ?? false,
			cookiesPath: options?.cookiesPath ?? "./cookies.json",
			timeout: options?.timeout ?? 60_000,
		};
	}

	/**
	 * Returns a Playwright browser+context with Pinterest auth applied.
	 * Tries cookies first (headless); falls back to headed manual login.
	 * Caller is responsible for closing the browser when done.
	 */
	async authenticate(): Promise<{ browser: Browser; context: BrowserContext }> {
		const saved = loadSession(this.options.cookiesPath);
		if (saved && isSessionPotentiallyValid(saved)) {
			// Headless reuse path
			const browser = await this.launchBrowser(this.options.headless);
			const context = await this.createContext(browser, saved.cookies);
			const stillLoggedIn = await this.verifyLoggedIn(context);
			if (stillLoggedIn) return { browser, context };

			console.warn("[browser-login] Saved cookies appear stale — falling back to headed login.");
			await browser.close();
		}

		// Headed manual-login path
		const browser = await this.launchBrowser(false);
		const context = await this.createContext(browser);
		const page = await context.newPage();
		await page.goto(PINTEREST_URL, {
			waitUntil: "domcontentloaded",
			timeout: this.options.timeout,
		});
		await page.waitForTimeout(2_000);

		const alreadyLoggedIn = await page.evaluate(
			() =>
				!document.querySelector('[data-test-id="login-button"]') &&
				!document.querySelector('[data-test-id="signup-button"]'),
		);

		if (!alreadyLoggedIn) {
			console.log("");
			console.log("  ┌─────────────────────────────────────────────────────────┐");
			console.log("  │  Pinterest wants you to log in.                         │");
			console.log("  │  Log in in the browser window that just opened, then    │");
			console.log("  │  return here and press Enter to continue.               │");
			console.log("  └─────────────────────────────────────────────────────────┘");
			await waitForEnter("\n  [Press Enter once you are logged in] ");
			await page.reload({ waitUntil: "domcontentloaded" });
			await page.waitForTimeout(2_000);

			const nowLoggedIn = await page.evaluate(
				() => !document.querySelector('[data-test-id="login-button"]'),
			);
			if (!nowLoggedIn) {
				console.log("  Still not logged in — pausing once more.");
				await waitForEnter("  [Press Enter once login is complete] ");
			}
		}

		// Persist cookies
		const cookies = await context.cookies();
		saveSession(this.options.cookiesPath, cookies);
		await page.close();

		return { browser, context };
	}

	private async verifyLoggedIn(context: BrowserContext): Promise<boolean> {
		try {
			const page = await context.newPage();
			await page.goto(PINTEREST_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
			await page.waitForTimeout(1_500);
			const loggedIn = await page.evaluate(
				() =>
					!document.querySelector('[data-test-id="login-button"]') &&
					!document.querySelector('[data-test-id="signup-button"]'),
			);
			await page.close();
			return loggedIn;
		} catch {
			return false;
		}
	}

	private async launchBrowser(headless: boolean): Promise<Browser> {
		return chromium.launch({
			headless,
			slowMo: headless ? 0 : 40,
			args: [
				"--disable-blink-features=AutomationControlled",
				"--no-sandbox",
				"--disable-setuid-sandbox",
			],
		});
	}

	private async createContext(
		browser: Browser,
		cookies?: Parameters<BrowserContext["addCookies"]>[0],
	): Promise<BrowserContext> {
		const context = await browser.newContext({
			viewport: { width: 1440, height: 900 },
			userAgent: USER_AGENT,
			locale: "en-US",
			extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
		});
		await context.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => undefined });
		});
		if (cookies && cookies.length > 0) {
			await context.addCookies(cookies);
		}
		return context;
	}
}
