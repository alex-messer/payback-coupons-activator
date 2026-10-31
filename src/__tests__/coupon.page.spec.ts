import { test, expect, mockHosts } from "./fixtures/chrome.fixture";
import { CouponPage } from "../pages/coupon.page";

const BASE = "https://www.payback.de";

// Simulates PayBack's coupon page: the server remembers activations, the page renders what is still open,
// clicking POSTs an activation, and the button flips to "-activated" only after the server confirmed it.
function couponSite({ ids, stuck = [] }: { ids: string[]; stuck?: string[] }) {
  const activated = new Set<string>();
  let couponPageLoads = 0;

  const renderCoupons = () => {
    const open = ids.filter(id => !activated.has(id));
    const buttons = open
      .map(id => `<button data-testid="coupon-button-${id}-not_activated" onclick="activate(this)">Aktivieren</button>`)
      .join("\n");
    const headline = open.length === 0 ? '<h1 data-testid="not-activated-coupons-headline">Alle aktiviert</h1>' : "";
    return `<!doctype html><html><body>${buttons}${headline}
<script>
async function activate(button) {
  const id = button.dataset.testid.replace(/^coupon-button-/, "").replace(/-not_activated$/, "");
  const response = await fetch("/api/activate/" + id);
  if (!response.ok) return;
  button.dataset.testid = "coupon-button-" + id + "-activated";
  // PayBack shows the "all done" headline as soon as the last open coupon is activated, without a reload.
  if (!document.querySelector('[data-testid$="-not_activated"]')) {
    const headline = document.createElement("h1");
    headline.dataset.testid = "not-activated-coupons-headline";
    headline.textContent = "Alle aktiviert";
    document.body.appendChild(headline);
  }
}
</script></body></html>`;
  };

  return {
    activated,
    get couponPageLoads() {
      return couponPageLoads;
    },
    handler: (url: URL, method: string) => {
      if (url.origin !== BASE) return undefined;
      if (url.pathname === "/coupons") {
        couponPageLoads++;
        return { body: renderCoupons() };
      }
      const match = url.pathname.match(/^\/api\/activate\/(.+)$/);
      if (match && method === "GET") {
        const id = match[1];
        if (stuck.includes(id)) return { status: 500, contentType: "text/plain", body: "stuck" };
        activated.add(id);
        return { contentType: "text/plain", body: "ok" };
      }
      return undefined;
    },
  };
}

// Long enough for the first mocked fetch after page load; still far below the production 10 s.
const FAST = { clickTimeoutMs: 1_500, reloadEvery: 50 };

test("activates every open coupon and reports the total", async ({ page }) => {
  const site = couponSite({ ids: ["a", "b", "c"] });
  await mockHosts(page, site.handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  const activated = await coupons.activateAllCoupons();

  expect(activated).toBe(3);
  expect([...site.activated].sort()).toEqual(["a", "b", "c"]);
  expect(coupons.activatedCount).toBe(3);
  expect(await coupons.hasNoCouponsLeft()).toBe(true);
});

test("countAvailableCoupons counts only not-activated buttons", async ({ page }) => {
  await mockHosts(page, couponSite({ ids: ["a", "b", "c", "d"] }).handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  expect(await coupons.countAvailableCoupons()).toBe(4);
});

test("hasNoCouponsLeft is false while coupons remain", async ({ page }) => {
  await mockHosts(page, couponSite({ ids: ["a"] }).handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  expect(await coupons.hasNoCouponsLeft()).toBe(false);
});

test("stops after the given limit and leaves the rest open", async ({ page }) => {
  const site = couponSite({ ids: ["a", "b", "c", "d", "e"] });
  await mockHosts(page, site.handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  const activated = await coupons.activateAllCoupons(3);

  expect(activated).toBe(3);
  expect(site.activated.size).toBe(3);
  expect(await coupons.countAvailableCoupons()).toBe(2);
});

test("a second call continues the running total and respects its own limit", async ({ page }) => {
  await mockHosts(page, couponSite({ ids: ["a", "b", "c", "d", "e"] }).handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  await coupons.activateAllCoupons(2);
  const total = await coupons.activateAllCoupons(2);

  expect(total).toBe(4);
  expect(coupons.activatedCount).toBe(4);
});

test("a stuck coupon is skipped after the click timeout and does not block the rest", async ({ page }) => {
  const site = couponSite({ ids: ["stuck", "ok1", "ok2"], stuck: ["stuck"] });
  await mockHosts(page, site.handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  const activated = await coupons.activateAllCoupons();

  expect(activated).toBe(2);
  expect([...site.activated].sort()).toEqual(["ok1", "ok2"]);
  expect(await coupons.countAvailableCoupons()).toBe(1);
  expect(await coupons.hasNoCouponsLeft()).toBe(false);
});

test("reloads the coupon page after every reloadEvery activations", async ({ page }) => {
  const site = couponSite({ ids: ["a", "b", "c", "d", "e"] });
  await mockHosts(page, site.handler);
  const coupons = new CouponPage(page, { ...FAST, reloadEvery: 2 });
  await coupons.navigate();

  await coupons.activateAllCoupons();

  // initial navigate + one reload after 2 activations + one after 4
  expect(site.couponPageLoads).toBe(3);
  expect(site.activated.size).toBe(5);
});

test("does nothing and reports 0 when no coupons are open", async ({ page }) => {
  await mockHosts(page, couponSite({ ids: [] }).handler);
  const coupons = new CouponPage(page, FAST);
  await coupons.navigate();

  expect(await coupons.activateAllCoupons()).toBe(0);
  expect(await coupons.hasNoCouponsLeft()).toBe(true);
});
