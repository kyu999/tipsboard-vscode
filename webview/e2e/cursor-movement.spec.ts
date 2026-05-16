import { expect, type Page, test } from "@playwright/test";
import {
  COMPREHENSIVE_CURSOR_ANCHORS,
  COMPREHENSIVE_CURSOR_LINE_COUNT,
  DECORATED_CURSOR_MARKDOWN,
  DISPLAY_MATH_CURSOR_MARKDOWN,
} from "../src/editor/cursor-test-fixtures";

type CursorTestApi = {
  mount: (doc?: string) => void;
  setCursor: (lineNumber: number, column?: number) => void;
  cursorLine: () => number;
  cursorColumn: () => number;
  docLine: (lineNumber: number) => string;
};

declare global {
  interface Window {
    __tipsboardCursorTest: CursorTestApi;
  }
}

async function setCursor(page: Page, lineNumber: number, column = 0) {
  await page.evaluate(
    ({ lineNumber: nextLineNumber, column: nextColumn }) => {
      window.__tipsboardCursorTest.setCursor(nextLineNumber, nextColumn);
    },
    { lineNumber, column },
  );
}

async function mountDoc(page: Page, doc: string) {
  await page.evaluate((nextDoc) => {
    window.__tipsboardCursorTest.mount(nextDoc);
  }, doc);
}

async function expectCursorLine(page: Page, lineNumber: number) {
  await expect
    .poll(() => page.evaluate(() => window.__tipsboardCursorTest.cursorLine()))
    .toBe(lineNumber);
}

async function expectCursorPosition(page: Page, lineNumber: number, column: number) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        line: window.__tipsboardCursorTest.cursorLine(),
        column: window.__tipsboardCursorTest.cursorColumn(),
      })),
    )
    .toEqual({ line: lineNumber, column });
}

async function cursorBox(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const box = await page.locator(".cm-cursor-primary").boundingBox();
  if (!box) throw new Error("Primary cursor is not visible");
  return box;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/cursor-test.html");
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("comprehensive decorated markdown exposes every cursor-risk widget", async ({ page }) => {
  await setCursor(page, COMPREHENSIVE_CURSOR_ANCHORS.title, 0);
  await expect(page.locator(".cm-tipsboard-table-wrapper")).toBeVisible();
  await expect(page.locator(".cm-image-widget")).toHaveCount(2);

  await setCursor(page, COMPREHENSIVE_CURSOR_ANCHORS.mermaidFenceOpen - 1, 0);
  await expect(page.locator(".cm-tipsboard-mermaid-wrapper")).toBeVisible();

  await setCursor(page, COMPREHENSIVE_CURSOR_ANCHORS.displayMathClose + 1, 0);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(2);

  await setCursor(page, COMPREHENSIVE_CURSOR_ANCHORS.divider - 1, 0);
  await expect(page.locator(".cm-tipsboard-divider")).toBeVisible();
});

test("ArrowDown and ArrowUp move one logical line through comprehensive decorated markdown", async ({
  page,
}) => {
  for (let lineNumber = 1; lineNumber < COMPREHENSIVE_CURSOR_LINE_COUNT; lineNumber += 1) {
    if (lineNumber === COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph) continue;

    await setCursor(page, lineNumber, 0);
    await page.keyboard.press("ArrowDown");
    await expectCursorLine(page, lineNumber + 1);
  }

  for (let lineNumber = COMPREHENSIVE_CURSOR_LINE_COUNT; lineNumber > 1; lineNumber -= 1) {
    if (
      lineNumber === COMPREHENSIVE_CURSOR_LINE_COUNT ||
      lineNumber === COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph ||
      lineNumber === COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph + 1
    ) {
      continue;
    }

    await setCursor(page, lineNumber, 0);
    await page.keyboard.press("ArrowUp");
    await expectCursorLine(page, lineNumber - 1);
  }
});

test("ArrowDown and ArrowUp move one logical line through decorated markdown", async ({ page }) => {
  await mountDoc(page, DECORATED_CURSOR_MARKDOWN);
  await setCursor(page, 3, 3);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 4);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 5);

  await page.keyboard.press("ArrowUp");
  await expectCursorLine(page, 4);
});

test("ArrowDown does not skip table rows", async ({ page }) => {
  await mountDoc(page, DECORATED_CURSOR_MARKDOWN);
  await setCursor(page, 6, 2);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 7);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 8);
});

test("ArrowDown does not skip fenced block lines", async ({ page }) => {
  await mountDoc(page, DECORATED_CURSOR_MARKDOWN);
  await setCursor(page, 9, 0);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 10);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 11);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 12);
});

test("ArrowDown walks visual lines before leaving a wrapped paragraph", async ({ page }) => {
  const longLine = "A long paragraph ".repeat(80).trim();
  await mountDoc(page, `Title\n${longLine}\nNext paragraph`);

  await setCursor(page, 2, 10);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 2);

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 2);
});

test("entering a display math block restores markup editing and moves by line and character", async ({ page }) => {
  await mountDoc(page, DISPLAY_MATH_CURSOR_MARKDOWN);

  const mathWidget = page.locator(".cm-tipsboard-katex-display");
  await expect(mathWidget).toBeVisible();

  await mathWidget.click();
  await expectCursorPosition(page, 3, 0);
  await expect(mathWidget).toHaveCount(0);
  await expect(page.locator(".cm-line", { hasText: "$$" }).first()).toBeVisible();
  await expect(page.locator(".cm-line", { hasText: String.raw`\begin{aligned}` })).toBeVisible();

  const firstLineCursor = await cursorBox(page);
  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 4, 0);
  const secondLineCursor = await cursorBox(page);
  expect(secondLineCursor.y).toBeGreaterThan(firstLineCursor.y + 10);
  expect(Math.abs(secondLineCursor.x - firstLineCursor.x)).toBeLessThan(5);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 5, 0);
  const thirdLineCursor = await cursorBox(page);
  expect(thirdLineCursor.y).toBeGreaterThan(secondLineCursor.y + 10);
  expect(Math.abs(thirdLineCursor.x - secondLineCursor.x)).toBeLessThan(5);

  await page.keyboard.press("ArrowRight");
  await expectCursorPosition(page, 5, 1);
  const oneCharRightCursor = await cursorBox(page);
  expect(oneCharRightCursor.x).toBeGreaterThan(thirdLineCursor.x + 1);
  expect(Math.abs(oneCharRightCursor.y - thirdLineCursor.y)).toBeLessThan(3);

  await page.keyboard.press("ArrowRight");
  await expectCursorPosition(page, 5, 2);
  const twoCharsRightCursor = await cursorBox(page);
  expect(twoCharsRightCursor.x).toBeGreaterThan(oneCharRightCursor.x + 1);
  expect(Math.abs(twoCharsRightCursor.y - oneCharRightCursor.y)).toBeLessThan(3);

  await page.keyboard.press("ArrowLeft");
  await expectCursorPosition(page, 5, 1);
  const oneCharLeftCursor = await cursorBox(page);
  expect(oneCharLeftCursor.x).toBeLessThan(twoCharsRightCursor.x - 1);
  expect(Math.abs(oneCharLeftCursor.y - twoCharsRightCursor.y)).toBeLessThan(3);
});

test("ArrowDown enters a display math block without skipping its source lines", async ({ page }) => {
  await mountDoc(page, DISPLAY_MATH_CURSOR_MARKDOWN);

  const mathWidget = page.locator(".cm-tipsboard-katex-display");
  await expect(mathWidget).toBeVisible();

  await setCursor(page, 2, 0);
  const beforeMathCursor = await cursorBox(page);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 3, 0);
  await expect(mathWidget).toHaveCount(0);
  await expect(page.locator(".cm-line", { hasText: "$$" }).first()).toBeVisible();
  const openingDelimiterCursor = await cursorBox(page);
  expect(openingDelimiterCursor.y).toBeGreaterThan(beforeMathCursor.y + 10);
  expect(Math.abs(openingDelimiterCursor.x - beforeMathCursor.x)).toBeLessThan(5);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 4, 0);
  const beginLineCursor = await cursorBox(page);
  expect(beginLineCursor.y).toBeGreaterThan(openingDelimiterCursor.y + 10);
  expect(Math.abs(beginLineCursor.x - openingDelimiterCursor.x)).toBeLessThan(5);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 5, 0);
  const equationLineCursor = await cursorBox(page);
  expect(equationLineCursor.y).toBeGreaterThan(beginLineCursor.y + 10);
  expect(Math.abs(equationLineCursor.x - beginLineCursor.x)).toBeLessThan(5);

  await mountDoc(page, DISPLAY_MATH_CURSOR_MARKDOWN);
  await expect(mathWidget).toBeVisible();

  await setCursor(page, 9, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 8, 0);
  await expect(mathWidget).toHaveCount(0);
  const closingDelimiterCursor = await cursorBox(page);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 7, 0);
  const endAlignedCursor = await cursorBox(page);
  expect(endAlignedCursor.y).toBeLessThan(closingDelimiterCursor.y - 10);
  expect(Math.abs(endAlignedCursor.x - closingDelimiterCursor.x)).toBeLessThan(5);
});

test("ArrowUp moves one logical line from below tall display math with a blank spacer", async ({
  page,
}) => {
  const doc = [
    "Untitled",
    "##### Rendered result:",
    "$$",
    String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
    "=",
    String.raw`\left(`,
    String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
    "+",
    String.raw`V(\mathbf{x})`,
    String.raw`\right)`,
    String.raw`\psi(\mathbf{x}, t)`,
    "$$",
    "",
    "- research notes",
  ].join("\n");
  await mountDoc(page, doc);

  const mathWidget = page.locator(".cm-tipsboard-katex-display");
  await expect(mathWidget).toBeVisible();

  await setCursor(page, 14, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 13, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 12, 0);
  await expect(mathWidget).toHaveCount(0);
});

test("ArrowUp stays near the active display math when multiple rendered math blocks exist", async ({
  page,
}) => {
  const doc = [
    "Math Expressions",
    "Tipsboard supports [KaTeX]-style mathematical expressions inside Markdown notes.",
    "**You** can write both inline equations and block equations while keeping everything in plain Markdown files.",
    "",
    "**Block equation example:**",
    "```md",
    "$$",
    String.raw`\hat{f}(\xi)`,
    "=",
    String.raw`\int_{-\infty}^{\infty}`,
    String.raw`f(x)\,`,
    String.raw`e^{-2\pi i x \xi}`,
    String.raw`\,dx`,
    "$$",
    "```",
    "",
    "**Rendered result:**",
    "",
    "$$",
    String.raw`\hat{f}(\xi)`,
    "=",
    String.raw`\int_{-\infty}^{\infty}`,
    String.raw`f(x)\,`,
    String.raw`e^{-2\pi i x \xi}`,
    String.raw`\,dx`,
    "$$",
    "",
    "---",
    "",
    "",
    "**More advanced expressions are also supported:**",
    "",
    "```md",
    "$$",
    String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
    "=",
    String.raw`\left(`,
    String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
    "+",
    String.raw`V(\mathbf{x})`,
    String.raw`\right)`,
    String.raw`\psi(\mathbf{x}, t)`,
    "$$",
    "```",
    "",
    "##### Rendered result:",
    "",
    "$$",
    String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
    "=",
    String.raw`\left(`,
    String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
    "+",
    String.raw`V(\mathbf{x})`,
    String.raw`\right)`,
    String.raw`\psi(\mathbf{x}, t)`,
    "$$",
    "",
    "This makes Tipsboard suitable for:",
    "",
    "- research notes",
  ].join("\n");
  await mountDoc(page, doc);

  const mathWidgets = page.locator(".cm-tipsboard-katex-display");
  await setCursor(page, 61, 0);
  await expect(mathWidgets).toHaveCount(2);

  await mathWidgets.nth(1).click();
  await expectCursorPosition(page, 48, 0);
  await expect(mathWidgets).toHaveCount(1);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 47, 0);
});

test("ArrowUp moves line-by-line in a fenced block below rendered display math", async ({
  page,
}) => {
  const doc = [
    "Untitled2",
    "```md",
    "$$",
    String.raw`\hat{f}(\xi)`,
    "=",
    String.raw`\int_{-\infty}^{\infty}`,
    String.raw`f(x)\,`,
    String.raw`e^{-2\pi i x \xi}`,
    String.raw`\,dx`,
    "$$",
    "```",
    "$$",
    String.raw`\hat{f}(\xi)`,
    "=",
    String.raw`\int_{-\infty}^{\infty}`,
    String.raw`f(x)\,`,
    String.raw`e^{-2\pi i x \xi}`,
    String.raw`\,dx`,
    "$$",
    "```md",
    "$$",
    String.raw`\frac{\partial}{\partial t} \psi(\mathbf{x}, t)`,
    "=",
    String.raw`\left(`,
    String.raw`-\frac{\hbar^2}{2m}\nabla^2`,
    "+",
    String.raw`V(\mathbf{x})`,
    String.raw`\right)`,
    String.raw`\psi(\mathbf{x}, t)`,
    "$$",
    "```",
  ].join("\n");
  await mountDoc(page, doc);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(1);

  for (let lineNumber = 31; lineNumber > 20; lineNumber -= 1) {
    await setCursor(page, lineNumber, 0);
    await page.keyboard.press("ArrowUp");
    await expectCursorPosition(page, lineNumber - 1, 0);
  }
});
