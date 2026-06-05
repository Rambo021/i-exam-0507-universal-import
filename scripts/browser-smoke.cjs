/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const path = require("path");

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

  const baseUrl = process.env.BASE_URL || "http://localhost:3001";
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.setInputFiles(
    'input[type="file"]',
    path.resolve(process.env.TEST_FILE || "tmp-safe-demos/demo03.xlsx"),
  );
  await page.waitForSelector("text=请选择已有规则或新建规则", { timeout: 30000 });

  await page.getByRole("button", { name: "新建规则 / AI 生成" }).click();
  try {
    await page.waitForFunction(() => document.querySelector("textarea")?.value.includes('"parser"'), null, {
      timeout: 120000,
    });
  } catch {
    await page.screenshot({ path: "tmp-browser-failed-ai.png", fullPage: true });
    const bodyText = await page.locator("body").innerText();
    throw new Error(`AI rule generation did not populate editor. Body: ${bodyText.slice(0, 1200)}`);
  }
  const ruleText = await page.locator("textarea").inputValue();

  await page.getByRole("button", { name: "保存当前规则" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "执行解析" }).click();
  await page.waitForSelector("text=/解析完成|解析失败/", { timeout: 60000 });

  const bodyText = await page.locator("body").innerText();
  const rowsText = bodyText.match(/解析完成：([0-9]+) 条 SKU/)?.[1] || "0";
  const errorText = bodyText.includes("解析失败") ? bodyText.match(/解析失败[^\n]*/)?.[0] : "";

  await page.screenshot({ path: "tmp-browser-home.png", fullPage: true });

  await page.goto(`${baseUrl}/rules`, { waitUntil: "networkidle", timeout: 30000 });
  const rulesText = await page.locator("body").innerText();
  await page.screenshot({ path: "tmp-browser-rules.png", fullPage: true });

  await page.goto(`${baseUrl}/orders`, { waitUntil: "networkidle", timeout: 30000 });
  const ordersText = await page.locator("body").innerText();
  await page.screenshot({ path: "tmp-browser-orders.png", fullPage: true });

  console.log(
    JSON.stringify(
      {
        title: await page.title(),
        ruleLength: ruleText.length,
        rows: Number(rowsText),
        errorText,
        rulesPageLoaded: rulesText.includes("解析规则管理"),
        ordersPageLoaded: ordersText.includes("已导入出库单"),
        logs: logs.slice(-10),
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
