import { expect, test } from "@playwright/test";
import {
  BOUNDARY_ARROW_CASES,
  BOUNDARY_BLOCKS_ANCHORS,
  BOUNDARY_BLOCKS_LINE_COUNT,
  BOUNDARY_BLOCKS_MARKDOWN,
  COMPREHENSIVE_CURSOR_ANCHORS,
  COMPREHENSIVE_CURSOR_LINE_COUNT,
  DECORATED_CURSOR_MARKDOWN,
  DISPLAY_MATH_CURSOR_MARKDOWN,
  FENCED_MATH_BELOW_RENDERED_LINE_COUNT,
  FENCED_MATH_BELOW_RENDERED_MARKDOWN,
  FENCED_MATH_PROSE_BELOW_ANCHORS,
  FENCED_MATH_PROSE_BELOW_MARKDOWN,
  MATH_EXPRESSIONS_BULLETS_ANCHORS,
  MATH_EXPRESSIONS_BULLETS_MARKDOWN,
  MATH_EXPRESSIONS_MULTI_BLOCK_ANCHORS,
  MATH_EXPRESSIONS_MULTI_BLOCK_MARKDOWN,
  TALL_MATH_SPACER_ANCHORS,
  TALL_MATH_SPACER_MARKDOWN,
  WRAPPED_PARAGRAPH_ANCHORS,
  WRAPPED_PARAGRAPH_MARKDOWN,
} from "../src/editor/cursor-test-fixtures";
import {
  cursorBox,
  expectCaretRowStep,
  expectCursorLine,
  expectCursorPosition,
  mountDoc,
  setCursor,
  walkLogicalLines,
} from "../src/editor/cursor-test-helpers";

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
  const skip = new Set([
    COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph,
    COMPREHENSIVE_CURSOR_ANCHORS.wrappedParagraph + 1,
  ]);

  await walkLogicalLines(page, 1, COMPREHENSIVE_CURSOR_LINE_COUNT - 1, "down", skip);
  await walkLogicalLines(page, COMPREHENSIVE_CURSOR_LINE_COUNT, 2, "up", skip);
});

test("ArrowDown and ArrowUp move one visual row through decorated markdown", async ({ page }) => {
  await mountDoc(page, DECORATED_CURSOR_MARKDOWN);
  await setCursor(page, 3, 3);

  let before = await cursorBox(page);
  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 4);
  before = await expectCaretRowStep(page, before, "down");

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, 5);
  before = await expectCaretRowStep(page, before, "down");

  await page.keyboard.press("ArrowUp");
  await expectCursorLine(page, 4);
  await expectCaretRowStep(page, before, "up");
});

test("ArrowDown does not skip table rows", async ({ page }) => {
  await mountDoc(page, DECORATED_CURSOR_MARKDOWN);
  await setCursor(page, 6, 2);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 7, 2);

  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, 8, 2);
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

test("ArrowDown walks visual lines in wrapped paragraph fixture", async ({ page }) => {
  await mountDoc(page, WRAPPED_PARAGRAPH_MARKDOWN);
  await setCursor(page, WRAPPED_PARAGRAPH_ANCHORS.wrappedLine, 10);

  let before = await cursorBox(page);
  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, WRAPPED_PARAGRAPH_ANCHORS.wrappedLine);
  before = await expectCaretRowStep(page, before, "down");

  await page.keyboard.press("ArrowDown");
  await expectCursorLine(page, WRAPPED_PARAGRAPH_ANCHORS.wrappedLine);
  before = await expectCaretRowStep(page, before, "down");

  await page.keyboard.press("ArrowUp");
  await expectCursorLine(page, WRAPPED_PARAGRAPH_ANCHORS.wrappedLine);
  await expectCaretRowStep(page, before, "up");
});

for (const { from, to, key } of BOUNDARY_ARROW_CASES) {
  test(`boundary ${key} from line ${from} to line ${to}`, async ({ page }) => {
    await mountDoc(page, BOUNDARY_BLOCKS_MARKDOWN);
    await setCursor(page, from, 0);
    await page.keyboard.press(key);
    await expectCursorLine(page, to);
  });
}

test("ArrowDown walks boundary blocks fixture line-by-line", async ({ page }) => {
  await mountDoc(page, BOUNDARY_BLOCKS_MARKDOWN);
  await walkLogicalLines(page, 1, BOUNDARY_BLOCKS_LINE_COUNT - 1, "down");
});

test("entering a display math block restores markup editing and moves by line and character", async ({
  page,
}) => {
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
  await mountDoc(page, TALL_MATH_SPACER_MARKDOWN);

  const mathWidget = page.locator(".cm-tipsboard-katex-display");
  await expect(mathWidget).toBeVisible();

  await setCursor(page, TALL_MATH_SPACER_ANCHORS.researchNotes, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, TALL_MATH_SPACER_ANCHORS.blankAfterMath, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, TALL_MATH_SPACER_ANCHORS.dollarMathOpen + 9, 0);
  await expect(mathWidget).toHaveCount(0);
});

test("ArrowUp stays near the active display math when multiple rendered math blocks exist", async ({
  page,
}) => {
  await mountDoc(page, MATH_EXPRESSIONS_MULTI_BLOCK_MARKDOWN);

  const mathWidgets = page.locator(".cm-tipsboard-katex-display");
  await setCursor(page, MATH_EXPRESSIONS_MULTI_BLOCK_ANCHORS.multiBlockCursorLine, 0);
  await expect(mathWidgets).toHaveCount(2);

  await mathWidgets.nth(1).click();
  await expectCursorPosition(page, MATH_EXPRESSIONS_MULTI_BLOCK_ANCHORS.secondRenderedDollarOpen, 0);
  await expect(mathWidgets).toHaveCount(1);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, MATH_EXPRESSIONS_MULTI_BLOCK_ANCHORS.secondRenderedDollarOpen - 1, 0);
});

test("ArrowUp moves line-by-line in a fenced block below rendered display math", async ({
  page,
}) => {
  await mountDoc(page, FENCED_MATH_BELOW_RENDERED_MARKDOWN);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(1);

  for (let lineNumber = FENCED_MATH_BELOW_RENDERED_LINE_COUNT; lineNumber > 20; lineNumber -= 1) {
    await setCursor(page, lineNumber, 0);
    await page.keyboard.press("ArrowUp");
    await expectCursorPosition(page, lineNumber - 1, 0);
  }
});

test("ArrowUp from prose below fenced math examples does not jump into an earlier block", async ({
  page,
}) => {
  await mountDoc(page, FENCED_MATH_PROSE_BELOW_MARKDOWN);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(1);

  await setCursor(page, FENCED_MATH_PROSE_BELOW_ANCHORS.proseCursorLine, 0);
  const proseCursor = await cursorBox(page);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, FENCED_MATH_PROSE_BELOW_ANCHORS.proseCursorLine - 1, 0);
  const blankCursor = await cursorBox(page);
  expect(blankCursor.y).toBeLessThan(proseCursor.y - 10);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, FENCED_MATH_PROSE_BELOW_ANCHORS.heading, 0);
  const headingCursor = await cursorBox(page);
  expect(headingCursor.y).toBeLessThan(blankCursor.y - 10);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, FENCED_MATH_PROSE_BELOW_ANCHORS.blankBeforeHeading, 0);
  const spacerCursor = await cursorBox(page);
  expect(spacerCursor.y).toBeLessThan(headingCursor.y - 10);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, FENCED_MATH_PROSE_BELOW_ANCHORS.fenceCloseLine, 0);
  const fenceCloseCursor = await cursorBox(page);
  expect(fenceCloseCursor.y).toBeLessThan(spacerCursor.y - 10);
});

test("ArrowUp from the bottom of math expression bullets walks list and prose lines", async ({
  page,
}) => {
  await mountDoc(page, MATH_EXPRESSIONS_BULLETS_MARKDOWN);
  await expect(page.locator(".cm-tipsboard-katex-display")).toBeVisible();

  const lastBullet = MATH_EXPRESSIONS_BULLETS_ANCHORS.lastBullet;
  const firstBullet = MATH_EXPRESSIONS_BULLETS_ANCHORS.firstBullet;

  for (let lineNumber = lastBullet; lineNumber > firstBullet; lineNumber -= 1) {
    await setCursor(page, lineNumber, 0);
    await page.keyboard.press("ArrowUp");
    await expectCursorPosition(page, lineNumber - 1, 0);
  }
});

test("ArrowUp into tall display math keeps the caret next to the row it left", async ({ page }) => {
  await mountDoc(page, TALL_MATH_SPACER_MARKDOWN);
  await setCursor(page, TALL_MATH_SPACER_ANCHORS.researchNotes, 0);

  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, TALL_MATH_SPACER_ANCHORS.blankAfterMath, 0);

  const blankCursor = await cursorBox(page);
  await page.keyboard.press("ArrowUp");
  await expectCursorPosition(page, 12, 0);
  await expectCaretRowStep(page, blankCursor, "up");
});

test("ArrowDown out of an opened display math block keeps the caret next to the row it left", async ({
  page,
}) => {
  const filler = Array.from({ length: 40 }, (_, index) => `Filler line ${index + 1}.`);
  await mountDoc(page, [...filler, ...TALL_MATH_SPACER_MARKDOWN.split("\n")].join("\n"));
  const closingLine = filler.length + 12;
  await setCursor(page, closingLine, 0);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(0);
  await page.evaluate(() => {
    const caret = window.__tipsboardCursorTest.cursorCoords();
    if (caret) window.scrollBy(0, caret.y - window.innerHeight / 2);
  });

  const closingCursor = await cursorBox(page);
  await page.keyboard.press("ArrowDown");
  await expectCursorPosition(page, closingLine + 1, 0);
  await expect(page.locator(".cm-tipsboard-katex-display")).toHaveCount(1);
  await expectCaretRowStep(page, closingCursor, "down");
});

test("caret stays on its text after an image above it finishes loading", async ({ page }) => {
  let releaseImage!: () => void;
  const imageGate = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  await page.route("https://tipsboard.invalid/delayed-image.svg", async (route) => {
    await imageGate;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="220"><rect width="240" height="220" fill="#ccc"/></svg>',
    });
  });

  await mountDoc(
    page,
    [
      "Image Fixture",
      "![Delayed](https://tipsboard.invalid/delayed-image.svg)",
      "Line after image.",
      "Another line.",
    ].join("\n"),
  );
  await setCursor(page, 4, 4);
  await expectCursorPosition(page, 4, 4);
  // Keep the editor updating while the image arrives, so its resize lands in the window
  // where CodeMirror ignores observed resizes.
  const typingWhileLoading = page.evaluate(async () => {
    const api = window.__tipsboardCursorTest;
    const img = document.querySelector<HTMLImageElement>(".cm-image-widget img");
    for (let tick = 0; tick < 200 && !(img?.complete && img.naturalHeight > 0); tick += 1) {
      api.setCursor(4, tick % 2 === 0 ? 3 : 4);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  releaseImage();
  await typingWhileLoading;
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>(".cm-image-widget img");
    return Boolean(img?.complete && img.naturalHeight > 0);
  });

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const api = window.__tipsboardCursorTest;
        const drawn = api.drawnCursorCoords();
        const actual = api.cursorCoords();
        return drawn && actual ? Math.abs(drawn.y - actual.y) : Number.POSITIVE_INFINITY;
      }),
    )
    .toBeLessThan(3);
});
