import { ApiError } from "@/models/errors";
import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import {
  ElementAttributes,
  SlideAttributesResult,
} from "@/types/element_attibutes";
import { convertElementAttributesToPptxSlides } from "@/utils/pptx_models_utils";
import { PptxPresentationModel } from "@/types/pptx_models";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

interface GetAllChildElementsAttributesArgs {
  element: ElementHandle<Element>;
  rootRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  depth?: number;
  inheritedFont?: ElementAttributes["font"];
  inheritedBackground?: ElementAttributes["background"];
  inheritedBorderRadius?: number[];
  inheritedZIndex?: number;
  inheritedOpacity?: number;
  isSvgChild?: boolean;
  inheritedClipPath?: string;
  screenshotsDir: string;
}

export async function GET(request: NextRequest) {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const id = await getPresentationId(request);
    [browser, page] = await getBrowserAndPage(id);
    const screenshotsDir = getScreenshotsDir();

    const { slides, speakerNotes } = await getSlidesAndSpeakerNotes(page);
    const slides_attributes = await getSlidesAttributes(slides, screenshotsDir);
    await postProcessSlidesAttributes(
      slides_attributes,
      screenshotsDir,
      speakerNotes
    );
    const slides_pptx_models =
      convertElementAttributesToPptxSlides(slides_attributes);
    const presentation_pptx_model: PptxPresentationModel = {
      slides: slides_pptx_models,
    };

    await closeBrowserAndPage(browser, page);

    return NextResponse.json(presentation_pptx_model);
  } catch (error: any) {
    console.error(error);
    await closeBrowserAndPage(browser, page);
    if (error instanceof ApiError) {
      return NextResponse.json(error, { status: 400 });
    }
    return NextResponse.json(
      { detail: `Internal server error: ${error.message}` },
      { status: 500 }
    );
  }
}

async function getPresentationId(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    throw new ApiError("Presentation ID not found");
  }
  return id;
}

async function getBrowserAndPage(id: string): Promise<[Browser, Page]> {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
    ],
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.setDefaultNavigationTimeout(300000);
  page.setDefaultTimeout(300000);
  await page.goto(`http://localhost/pdf-maker?id=${id}`, {
    waitUntil: "networkidle0",
    timeout: 300000,
  });
  return [browser, page];
}

async function closeBrowserAndPage(browser: Browser | null, page: Page | null) {
  await page?.close();
  await browser?.close();
}

function getScreenshotsDir() {
  const tempDir = process.env.TEMP_DIRECTORY;
  if (!tempDir) {
    console.warn(
      "TEMP_DIRECTORY environment variable not set, skipping screenshot"
    );
    throw new ApiError("TEMP_DIRECTORY environment variable not set");
  }
  const screenshotsDir = path.join(tempDir, "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  return screenshotsDir;
}

async function postProcessSlidesAttributes(
  slidesAttributes: SlideAttributesResult[],
  screenshotsDir: string,
  speakerNotes: string[]
) {
  for (const [index, slideAttributes] of slidesAttributes.entries()) {
    for (const element of slideAttributes.elements) {
      if (element.should_screenshot && element.element) {
        const screenshotPath = await screenshotElement(element, screenshotsDir);
        element.imageSrc = screenshotPath;
        element.objectFit = "cover";
        element.should_screenshot = false;
        element.element = undefined;
      } else if (
        element.tagName === "img" &&
        element.imageSrc &&
        isSvgSource(element.imageSrc) &&
        element.position?.width &&
        element.position?.height
      ) {
        try {
          const pngBytes = await rasterizeSvgFromSource(
            element.imageSrc,
            Math.round(element.position.width),
            Math.round(element.position.height)
          );
          const screenshotPath = path.join(
            screenshotsDir,
            `${uuidv4()}.png`
          ) as `${string}.png`;
          fs.writeFileSync(screenshotPath, pngBytes);
          element.imageSrc = screenshotPath;
          if (!element.objectFit) {
            element.objectFit = "contain";
          }
        } catch (e) {
          // If conversion fails, leave the original src as-is
          console.warn("[postProcess] Failed to convert SVG to PNG", e);
        }
      }
    }
    slideAttributes.speakerNote = speakerNotes[index];
  }
}

async function screenshotElement(
  element: ElementAttributes,
  screenshotsDir: string
) {
  const screenshotPath = path.join(
    screenshotsDir,
    `${uuidv4()}.png`
  ) as `${string}.png`;

  // For SVG elements, use convertSvgToPng
  if (element.tagName === "svg") {
    const pngBuffer = await convertSvgToPng(element);
    fs.writeFileSync(screenshotPath, pngBuffer);
    return screenshotPath;
  }

  // Hide all elements except the target element and its ancestors
  await element.element?.evaluate(
    (el) => {
      const originalOpacities = new Map();

      const hideAllExcept = (targetElement: Element) => {
        const allElements = document.querySelectorAll("*");

        allElements.forEach((elem) => {
          const computedStyle = window.getComputedStyle(elem);
          originalOpacities.set(elem, computedStyle.opacity);

          if (
            targetElement === elem ||
            targetElement.contains(elem) ||
            elem.contains(targetElement)
          ) {
            (elem as HTMLElement).style.opacity = computedStyle.opacity || "1";
            return;
          }

          (elem as HTMLElement).style.opacity = "0";
        });
      };

      hideAllExcept(el);

      (el as any).__restoreStyles = () => {
        originalOpacities.forEach((opacity, elem) => {
          (elem as HTMLElement).style.opacity = opacity;
        });
      };
    },
    element.opacity,
    element.font?.color
  );

  const screenshot = await element.element?.screenshot({
    path: screenshotPath,
  });
  if (!screenshot) {
    throw new ApiError("Failed to screenshot element");
  }

  await element.element?.evaluate((el) => {
    if ((el as any).__restoreStyles) {
      (el as any).__restoreStyles();
    }
  });

  return screenshotPath;
}

const convertSvgToPng = async (element_attibutes: ElementAttributes) => {
  const svgHtml =
    (await element_attibutes.element?.evaluate((el) => {
      // Apply font color
      const fontColor = window.getComputedStyle(el).color;
      (el as HTMLElement).style.color = fontColor;

      return el.outerHTML;
    })) || "";
  const targetWidth = Math.max(
    1,
    Math.round(element_attibutes.position!.width!)
  );
  const targetHeight = Math.max(
    1,
    Math.round(element_attibutes.position!.height!)
  );

  // Ensure root <svg> has explicit width/height attributes matching element size
  let adjustedSvgHtml = svgHtml;
  try {
    const svgOpenTagMatch = adjustedSvgHtml.match(/<svg\b[^>]*>/i);
    if (svgOpenTagMatch) {
      let svgOpenTag = svgOpenTagMatch[0];

      // Replace or add width
      if (/\bwidth\s*=\s*["'][^"']*["']/i.test(svgOpenTag)) {
        svgOpenTag = svgOpenTag.replace(
          /\bwidth\s*=\s*["'][^"']*["']/i,
          `width="${targetWidth}"`
        );
      } else {
        svgOpenTag = svgOpenTag.replace(
          /^<svg\b/i,
          `<svg width="${targetWidth}"`
        );
      }

      // Replace or add height
      if (/\bheight\s*=\s*["'][^"']*["']/i.test(svgOpenTag)) {
        svgOpenTag = svgOpenTag.replace(
          /\bheight\s*=\s*["'][^"']*["']/i,
          `height="${targetHeight}"`
        );
      } else {
        svgOpenTag = svgOpenTag.replace(
          /^<svg\b/i,
          `<svg height="${targetHeight}"`
        );
      }

      adjustedSvgHtml = adjustedSvgHtml.replace(svgOpenTagMatch[0], svgOpenTag);
    }
  } catch {}

  const svgBuffer = Buffer.from(adjustedSvgHtml);
  const pngBuffer = await sharp(svgBuffer, {
    density: 500,
  })
    .resize(targetWidth * 2, targetHeight * 2)
    .toFormat("png")
    .toBuffer();
  return pngBuffer;
};

function isSvgSource(src: string): boolean {
  const lower = src.toLowerCase();
  if (lower.startsWith("data:image/svg+xml")) return true;
  try {
    const u = new URL(src);
    const pathname = u.pathname.toLowerCase();
    // Direct file extensions
    if (pathname.endsWith(".svg") || pathname.endsWith(".svgz")) return true;

    // Known proxy-style endpoints that return SVG (e.g. presenton update-svg service)
    // Example: https://presenton.ai/api/update-svg?url=...&color=...
    if (pathname.includes("update-svg")) return true;

    // If an inner URL is provided as a query parameter, check it too
    const innerUrl = u.searchParams.get("url");
    if (innerUrl) {
      try {
        const inner = new URL(innerUrl);
        const innerPath = inner.pathname.toLowerCase();
        if (innerPath.endsWith(".svg") || innerPath.endsWith(".svgz"))
          return true;
      } catch {
        // ignore invalid inner URL
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function rasterizeSvgFromSource(
  src: string,
  width: number,
  height: number
): Promise<Uint8Array> {
  let svgBuffer: Buffer;
  const lower = src.toLowerCase();

  if (lower.startsWith("data:image/svg+xml")) {
    const commaIndex = src.indexOf(",");
    const meta = src.substring(0, commaIndex);
    const data = src.substring(commaIndex + 1);
    if (meta.includes(";base64")) {
      svgBuffer = Buffer.from(data, "base64");
    } else {
      svgBuffer = Buffer.from(decodeURIComponent(data), "utf8");
    }
  } else {
    const res = await fetch(src);
    if (!res.ok) {
      throw new Error(`Failed to fetch SVG: ${res.status} ${res.statusText}`);
    }
    const ab = await res.arrayBuffer();
    svgBuffer = Buffer.from(ab);
  }

  const pngBuffer = await sharp(svgBuffer, { density: 500 })
    .resize(width * 2, height * 2)
    .png()
    .toBuffer();
  return new Uint8Array(pngBuffer);
}

async function getSlidesAttributes(
  slides: ElementHandle<Element>[],
  screenshotsDir: string
): Promise<SlideAttributesResult[]> {
  const slideAttributes = await Promise.all(
    slides.map((slide) =>
      getAllChildElementsAttributes({ element: slide, screenshotsDir })
    )
  );
  return slideAttributes;
}

async function getSlidesAndSpeakerNotes(page: Page) {
  const slides_wrapper = await getSlidesWrapper(page);
  const speakerNotes = await getSpeakerNotes(slides_wrapper);
  const slides = await slides_wrapper.$$(":scope > div > div");
  return { slides, speakerNotes };
}

async function getSlidesWrapper(page: Page): Promise<ElementHandle<Element>> {
  const slides_wrapper = await page.$("#presentation-slides-wrapper");
  if (!slides_wrapper) {
    throw new ApiError("Presentation slides not found");
  }
  return slides_wrapper;
}

async function getSpeakerNotes(slides_wrapper: ElementHandle<Element>) {
  return await slides_wrapper.evaluate((el) => {
    return Array.from(el.querySelectorAll("[data-speaker-note]")).map(
      (el) => el.getAttribute("data-speaker-note") || ""
    );
  });
}

async function getAllChildElementsAttributes({
  element,
  rootRect = null,
  depth = 0,
  inheritedFont,
  inheritedBackground,
  inheritedBorderRadius,
  inheritedZIndex,
  inheritedOpacity,
  isSvgChild,
  inheritedClipPath,
  screenshotsDir,
}: GetAllChildElementsAttributesArgs): Promise<SlideAttributesResult> {
  if (!rootRect) {
    const rootAttributes = await getElementAttributes(element);
    inheritedFont = rootAttributes.font;
    inheritedBackground = rootAttributes.background;
    inheritedZIndex = rootAttributes.zIndex;
    inheritedOpacity = rootAttributes.opacity;
    rootRect = {
      left: rootAttributes.position?.left ?? 0,
      top: rootAttributes.position?.top ?? 0,
      width: rootAttributes.position?.width ?? 1280,
      height: rootAttributes.position?.height ?? 720,
    };
  }

  const directChildElementHandles = await element.$$(":scope > *");

  const allResults: { attributes: ElementAttributes; depth: number }[] = [];

  for (const childElementHandle of directChildElementHandles) {
    const attributes = await getElementAttributes(childElementHandle);

    if (
      ["style", "script", "link", "meta", "path"].includes(attributes.tagName)
    ) {
      continue;
    }
    if (isSvgChild && ["text", "g"].includes(attributes.tagName)) {
      continue;
    }

    // Special Recharts case
    if (attributes.className?.includes("recharts-tooltip-wrapper")) {
      continue;
    }

    if (
      inheritedFont &&
      !attributes.font &&
      attributes.innerText &&
      attributes.innerText.trim().length > 0
    ) {
      attributes.font = inheritedFont;
    }
    if (inheritedBackground && !attributes.background && attributes.shadow) {
      attributes.background = inheritedBackground;
    }
    if (inheritedBorderRadius && !attributes.borderRadius) {
      attributes.borderRadius = inheritedBorderRadius;
    }
    if (
      inheritedOpacity !== undefined &&
      (attributes.opacity === undefined || attributes.opacity === 1)
    ) {
      attributes.opacity = inheritedOpacity;
    }

    if (
      attributes.position &&
      attributes.position.left !== undefined &&
      attributes.position.top !== undefined
    ) {
      attributes.position = {
        left: attributes.position.left - rootRect!.left,
        top: attributes.position.top - rootRect!.top,
        width: attributes.position.width,
        height: attributes.position.height,
      };
    }

    // Ignore elements with no size (width or height)
    if (
      attributes.position === undefined ||
      attributes.position.width === undefined ||
      attributes.position.height === undefined
    ) {
      continue;
    }
    if (
      attributes.tagName === "svg" &&
      (attributes.position.width === 0 || attributes.position.height === 0)
    ) {
      continue;
    }

    // If element is paragraph or div and contains only inline formatting tags, don't go deeper
    if (attributes.tagName === "p" || attributes.tagName === "div") {
      const innerElementTagNames = await childElementHandle.evaluate((el) => {
        return Array.from(el.querySelectorAll("*")).map((e) =>
          e.tagName.toLowerCase()
        );
      });

      const allowedInlineTags = new Set([
        "strong",
        "u",
        "em",
        "code",
        "s",
        "br",
      ]);
      const hasOnlyAllowedInlineTags = innerElementTagNames.every((tag) =>
        allowedInlineTags.has(tag)
      );

      if (innerElementTagNames.length > 0 && hasOnlyAllowedInlineTags) {
        attributes.innerText = await childElementHandle.evaluate((el) => {
          return el.innerHTML;
        });
        allResults.push({ attributes, depth });
        continue;
      }
    }

    if (
      attributes.tagName === "svg" ||
      attributes.tagName === "canvas" ||
      attributes.tagName === "table"
    ) {
      attributes.should_screenshot = true;
      attributes.element = childElementHandle;
    }

    allResults.push({ attributes, depth });

    // If the element is a canvas, or table, we don't need to go deeper
    if (attributes.should_screenshot && attributes.tagName !== "svg") {
      continue;
    }

    const childResults = await getAllChildElementsAttributes({
      element: childElementHandle,
      rootRect: rootRect,
      depth: depth + 1,
      inheritedFont: attributes.font || inheritedFont,
      inheritedBackground: attributes.background || inheritedBackground,
      inheritedBorderRadius: attributes.borderRadius || inheritedBorderRadius,
      inheritedZIndex: attributes.zIndex || inheritedZIndex,
      inheritedOpacity: attributes.opacity || inheritedOpacity,
      isSvgChild: attributes.tagName === "svg" || isSvgChild,
      inheritedClipPath: attributes.clipPath || inheritedClipPath,
      screenshotsDir,
    });
    allResults.push(
      ...childResults.elements.map((attr) => ({
        attributes: attr,
        depth: depth + 1,
      }))
    );
  }

  let backgroundColor = inheritedBackground?.color;
  if (depth === 0) {
    const elementsWithRootPosition = allResults.filter(({ attributes }) => {
      return (
        attributes.position &&
        attributes.position.left === 0 &&
        attributes.position.top === 0 &&
        attributes.position.width === rootRect!.width &&
        attributes.position.height === rootRect!.height
      );
    });

    for (const { attributes } of elementsWithRootPosition) {
      if (attributes.background && attributes.background.color) {
        backgroundColor = attributes.background.color;
        break;
      }
    }
  }

  const filteredResults =
    depth === 0
      ? allResults.filter(({ attributes }) => {
          const hasBackground =
            attributes.background && attributes.background.color;
          const hasBorder = attributes.border && attributes.border.color;
          const hasShadow = attributes.shadow && attributes.shadow.color;
          const hasText =
            attributes.innerText && attributes.innerText.trim().length > 0;
          const hasImage = attributes.imageSrc;
          const isSvg = attributes.tagName === "svg";
          const isCanvas = attributes.tagName === "canvas";
          const isTable = attributes.tagName === "table";

          const occupiesRoot =
            attributes.position &&
            attributes.position.left === 0 &&
            attributes.position.top === 0 &&
            attributes.position.width === rootRect!.width &&
            attributes.position.height === rootRect!.height;

          const hasVisualProperties =
            hasBackground || hasBorder || hasShadow || hasText;
          const hasSpecialContent = hasImage || isSvg || isCanvas || isTable;

          return (hasVisualProperties && !occupiesRoot) || hasSpecialContent;
        })
      : allResults;

  if (depth === 0) {
    const sortedElements = filteredResults
      .sort((a, b) => {
        // Use actual zIndex values, including negatives and zero
        const zIndexA =
          typeof a.attributes.zIndex === "number" ? a.attributes.zIndex : 0;
        const zIndexB =
          typeof b.attributes.zIndex === "number" ? b.attributes.zIndex : 0;

        if (zIndexA === zIndexB) {
          // If zIndex is equal, preserve original order (do not change positions)
          return 0;
        }

        // Lower zIndex first, higher zIndex last
        return zIndexA - zIndexB;
      })
      .map(({ attributes }) => {
        if (
          attributes.shadow &&
          attributes.shadow.color &&
          (!attributes.background || !attributes.background.color) &&
          backgroundColor
        ) {
          attributes.background = {
            color: backgroundColor,
            opacity: undefined,
          };
        }
        return attributes;
      });

    return {
      elements: sortedElements,
      backgroundColor,
    };
  } else {
    return {
      elements: filteredResults.map(({ attributes }) => attributes),
      backgroundColor,
    };
  }
}

async function getElementAttributes(
  element: ElementHandle<Element>
): Promise<ElementAttributes> {
  const attributes = await element.evaluate((el: Element) => {
    function colorToHex(color: string): {
      hex: string | undefined;
      opacity: number | undefined;
    } {
      if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
        return { hex: undefined, opacity: undefined };
      }

      if (color.startsWith("rgba(") || color.startsWith("hsla(")) {
        const match = color.match(/rgba?\(([^)]+)\)|hsla?\(([^)]+)\)/);
        if (match) {
          const values = match[1] || match[2];
          const parts = values.split(",").map((part) => part.trim());

          if (parts.length >= 4) {
            const opacity = parseFloat(parts[3]);
            const rgbColor = color
              .replace(/rgba?\(|hsla?\(|\)/g, "")
              .split(",")
              .slice(0, 3)
              .join(",");
            const rgbString = color.startsWith("rgba")
              ? `rgb(${rgbColor})`
              : `hsl(${rgbColor})`;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.fillStyle = rgbString;
              const hexColor = ctx.fillStyle;
              const hex = hexColor.startsWith("#")
                ? hexColor.substring(1)
                : hexColor;
              const result = {
                hex,
                opacity: isNaN(opacity) ? undefined : opacity,
              };

              return result;
            }
          }
        }
      }

      if (color.startsWith("rgb(") || color.startsWith("hsl(")) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = color;
          const hexColor = ctx.fillStyle;
          const hex = hexColor.startsWith("#")
            ? hexColor.substring(1)
            : hexColor;
          return { hex, opacity: undefined };
        }
      }

      if (color.startsWith("#")) {
        const hex = color.substring(1);
        return { hex, opacity: undefined };
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return { hex: color, opacity: undefined };

      ctx.fillStyle = color;
      const hexColor = ctx.fillStyle;
      const hex = hexColor.startsWith("#") ? hexColor.substring(1) : hexColor;
      const result = { hex, opacity: undefined };

      return result;
    }

    function hasOnlyTextNodes(el: Element): boolean {
      const children = el.childNodes;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === Node.ELEMENT_NODE) {
          return false;
        }
      }
      return true;
    }

    function parsePosition(el: Element) {
      const rect = el.getBoundingClientRect();
      return {
        left: isFinite(rect.left) ? rect.left : 0,
        top: isFinite(rect.top) ? rect.top : 0,
        width: isFinite(rect.width) ? rect.width : 0,
        height: isFinite(rect.height) ? rect.height : 0,
      };
    }

    function parseBackground(computedStyles: CSSStyleDeclaration) {
      const backgroundColorResult = colorToHex(computedStyles.backgroundColor);

      const background = {
        color: backgroundColorResult.hex,
        opacity: backgroundColorResult.opacity,
      };

      // Return undefined if background has no meaningful values
      if (!background.color && background.opacity === undefined) {
        return undefined;
      }

      return background;
    }

    function parseBackgroundImage(computedStyles: CSSStyleDeclaration) {
      const backgroundImage = computedStyles.backgroundImage;

      if (!backgroundImage || backgroundImage === "none") {
        return undefined;
      }

      // Extract URL from background-image style
      const urlMatch = backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }

      return undefined;
    }

    function parseBorder(computedStyles: CSSStyleDeclaration) {
      const borderColorResult = colorToHex(computedStyles.borderColor);
      const borderWidth = parseFloat(computedStyles.borderWidth);

      if (borderWidth === 0) {
        return undefined;
      }

      const border = {
        color: borderColorResult.hex,
        width: isNaN(borderWidth) ? undefined : borderWidth,
        opacity: borderColorResult.opacity,
      };

      // Return undefined if border has no meaningful values
      if (
        !border.color &&
        border.width === undefined &&
        border.opacity === undefined
      ) {
        return undefined;
      }

      return border;
    }

    function parseShadow(computedStyles: CSSStyleDeclaration) {
      const boxShadow = computedStyles.boxShadow;
      if (boxShadow !== "none") {
      }
      let shadow: {
        offset?: [number, number];
        color?: string;
        opacity?: number;
        radius?: number;
        angle?: number;
        spread?: number;
        inset?: boolean;
      } = {};

      if (boxShadow && boxShadow !== "none") {
        const shadows: string[] = [];
        let currentShadow = "";
        let parenCount = 0;

        for (let i = 0; i < boxShadow.length; i++) {
          const char = boxShadow[i];
          if (char === "(") {
            parenCount++;
          } else if (char === ")") {
            parenCount--;
          } else if (char === "," && parenCount === 0) {
            shadows.push(currentShadow.trim());
            currentShadow = "";
            continue;
          }
          currentShadow += char;
        }

        if (currentShadow.trim()) {
          shadows.push(currentShadow.trim());
        }

        let selectedShadow = "";
        let bestShadowScore = -1;

        for (let i = 0; i < shadows.length; i++) {
          const shadowStr = shadows[i];

          const shadowParts = shadowStr.split(" ");
          const numericParts: number[] = [];
          const colorParts: string[] = [];
          let isInset = false;
          let currentColor = "";
          let inColorFunction = false;

          for (let j = 0; j < shadowParts.length; j++) {
            const part = shadowParts[j];
            const trimmedPart = part.trim();
            if (trimmedPart === "") continue;

            if (trimmedPart.toLowerCase() === "inset") {
              isInset = true;
              continue;
            }

            if (trimmedPart.match(/^(rgba?|hsla?)\s*\(/i)) {
              inColorFunction = true;
              currentColor = trimmedPart;
              continue;
            }

            if (inColorFunction) {
              currentColor += " " + trimmedPart;

              const openParens = (currentColor.match(/\(/g) || []).length;
              const closeParens = (currentColor.match(/\)/g) || []).length;

              if (openParens <= closeParens) {
                colorParts.push(currentColor);
                currentColor = "";
                inColorFunction = false;
              }
              continue;
            }

            const numericValue = parseFloat(trimmedPart);
            if (!isNaN(numericValue)) {
              numericParts.push(numericValue);
            } else {
              colorParts.push(trimmedPart);
            }
          }

          let hasVisibleColor = false;
          if (colorParts.length > 0) {
            const shadowColor = colorParts.join(" ");
            const colorResult = colorToHex(shadowColor);
            hasVisibleColor = !!(
              colorResult.hex &&
              colorResult.hex !== "000000" &&
              colorResult.opacity !== 0
            );
          }

          const hasNonZeroValues = numericParts.some((value) => value !== 0);

          let shadowScore = 0;
          if (hasNonZeroValues) {
            shadowScore += numericParts.filter((value) => value !== 0).length;
          }
          if (hasVisibleColor) {
            shadowScore += 2;
          }

          if (
            (hasNonZeroValues || hasVisibleColor) &&
            shadowScore > bestShadowScore
          ) {
            selectedShadow = shadowStr;
            bestShadowScore = shadowScore;
          }
        }

        if (!selectedShadow && shadows.length > 0) {
          selectedShadow = shadows[0];
        }

        if (selectedShadow) {
          const shadowParts = selectedShadow.split(" ");
          const numericParts: number[] = [];
          const colorParts: string[] = [];
          let isInset = false;
          let currentColor = "";
          let inColorFunction = false;

          for (let i = 0; i < shadowParts.length; i++) {
            const part = shadowParts[i];
            const trimmedPart = part.trim();
            if (trimmedPart === "") continue;

            if (trimmedPart.toLowerCase() === "inset") {
              isInset = true;
              continue;
            }

            if (trimmedPart.match(/^(rgba?|hsla?)\s*\(/i)) {
              inColorFunction = true;
              currentColor = trimmedPart;
              continue;
            }

            if (inColorFunction) {
              currentColor += " " + trimmedPart;

              const openParens = (currentColor.match(/\(/g) || []).length;
              const closeParens = (currentColor.match(/\)/g) || []).length;

              if (openParens <= closeParens) {
                colorParts.push(currentColor);
                currentColor = "";
                inColorFunction = false;
              }
              continue;
            }

            const numericValue = parseFloat(trimmedPart);
            if (!isNaN(numericValue)) {
              numericParts.push(numericValue);
            } else {
              colorParts.push(trimmedPart);
            }
          }

          if (numericParts.length >= 2) {
            const offsetX = numericParts[0];
            const offsetY = numericParts[1];
            const blurRadius = numericParts.length >= 3 ? numericParts[2] : 0;
            const spreadRadius = numericParts.length >= 4 ? numericParts[3] : 0;

            // Only create shadow if color is present
            if (colorParts.length > 0) {
              const shadowColor = colorParts.join(" ");
              const shadowColorResult = colorToHex(shadowColor);

              if (shadowColorResult.hex) {
                shadow = {
                  offset: [offsetX, offsetY],
                  color: shadowColorResult.hex,
                  opacity: shadowColorResult.opacity,
                  radius: blurRadius,
                  spread: spreadRadius,
                  inset: isInset,
                  angle: Math.atan2(offsetY, offsetX) * (180 / Math.PI),
                };
              }
            }
          }
        }
      }

      // Return undefined if shadow is empty (no meaningful values)
      if (Object.keys(shadow).length === 0) {
        return undefined;
      }

      return shadow;
    }

    function parseFont(computedStyles: CSSStyleDeclaration) {
      const fontSize = parseFloat(computedStyles.fontSize);
      const fontWeight = parseInt(computedStyles.fontWeight);
      const fontColorResult = colorToHex(computedStyles.color);
      const fontFamily = computedStyles.fontFamily;
      const fontStyle = computedStyles.fontStyle;

      let fontName: string | undefined;
      if (fontFamily !== "initial") {
        const firstFont = fontFamily.split(",")[0].trim().replace(/['"]/g, "");
        fontName = firstFont;
      }

      const font = {
        name: fontName,
        size: isNaN(fontSize) ? undefined : fontSize,
        weight: isNaN(fontWeight) ? undefined : fontWeight,
        color: fontColorResult.hex,
        italic: fontStyle === "italic",
      };

      // Return undefined if font has no meaningful values
      if (
        !font.name &&
        font.size === undefined &&
        font.weight === undefined &&
        !font.color &&
        !font.italic
      ) {
        return undefined;
      }

      return font;
    }

    function parseLineHeight(computedStyles: CSSStyleDeclaration, el: Element) {
      const lineHeight = computedStyles.lineHeight;
      const innerText = el.textContent || "";

      const htmlEl = el as HTMLElement;

      const fontSize = parseFloat(computedStyles.fontSize);
      const computedLineHeight = parseFloat(computedStyles.lineHeight);

      const singleLineHeight = !isNaN(computedLineHeight)
        ? computedLineHeight
        : fontSize * 1.2;

      const hasExplicitLineBreaks =
        innerText.includes("\n") ||
        innerText.includes("\r") ||
        innerText.includes("\r\n");
      const hasTextWrapping = htmlEl.offsetHeight > singleLineHeight * 2;
      const hasOverflow = htmlEl.scrollHeight > htmlEl.clientHeight;

      const isMultiline =
        hasExplicitLineBreaks || hasTextWrapping || hasOverflow;

      if (isMultiline && lineHeight && lineHeight !== "normal") {
        const parsedLineHeight = parseFloat(lineHeight);
        if (!isNaN(parsedLineHeight)) {
          return parsedLineHeight;
        }
      }

      return undefined;
    }

    function parseMargin(computedStyles: CSSStyleDeclaration) {
      const marginTop = parseFloat(computedStyles.marginTop);
      const marginBottom = parseFloat(computedStyles.marginBottom);
      const marginLeft = parseFloat(computedStyles.marginLeft);
      const marginRight = parseFloat(computedStyles.marginRight);
      const marginObj = {
        top: isNaN(marginTop) ? undefined : marginTop,
        bottom: isNaN(marginBottom) ? undefined : marginBottom,
        left: isNaN(marginLeft) ? undefined : marginLeft,
        right: isNaN(marginRight) ? undefined : marginRight,
      };

      return marginObj.top === 0 &&
        marginObj.bottom === 0 &&
        marginObj.left === 0 &&
        marginObj.right === 0
        ? undefined
        : marginObj;
    }

    function parsePadding(computedStyles: CSSStyleDeclaration) {
      const paddingTop = parseFloat(computedStyles.paddingTop);
      const paddingBottom = parseFloat(computedStyles.paddingBottom);
      const paddingLeft = parseFloat(computedStyles.paddingLeft);
      const paddingRight = parseFloat(computedStyles.paddingRight);
      const paddingObj = {
        top: isNaN(paddingTop) ? undefined : paddingTop,
        bottom: isNaN(paddingBottom) ? undefined : paddingBottom,
        left: isNaN(paddingLeft) ? undefined : paddingLeft,
        right: isNaN(paddingRight) ? undefined : paddingRight,
      };

      return paddingObj.top === 0 &&
        paddingObj.bottom === 0 &&
        paddingObj.left === 0 &&
        paddingObj.right === 0
        ? undefined
        : paddingObj;
    }

    function parseBorderRadius(
      computedStyles: CSSStyleDeclaration,
      el: Element
    ) {
      const borderRadius = computedStyles.borderRadius;
      let borderRadiusValue;

      if (borderRadius && borderRadius !== "0px") {
        const radiusParts = borderRadius
          .split(" ")
          .map((part) => parseFloat(part));
        if (radiusParts.length === 1) {
          borderRadiusValue = [
            radiusParts[0],
            radiusParts[0],
            radiusParts[0],
            radiusParts[0],
          ];
        } else if (radiusParts.length === 2) {
          borderRadiusValue = [
            radiusParts[0],
            radiusParts[1],
            radiusParts[0],
            radiusParts[1],
          ];
        } else if (radiusParts.length === 3) {
          borderRadiusValue = [
            radiusParts[0],
            radiusParts[1],
            radiusParts[2],
            radiusParts[1],
          ];
        } else if (radiusParts.length === 4) {
          borderRadiusValue = radiusParts;
        }

        // Clamp border radius values to be between 0 and half the width/height
        if (borderRadiusValue) {
          const rect = el.getBoundingClientRect();
          const maxRadiusX = rect.width / 2;
          const maxRadiusY = rect.height / 2;

          borderRadiusValue = borderRadiusValue.map((radius, index) => {
            // For top-left and bottom-right corners, use maxRadiusX
            // For top-right and bottom-left corners, use maxRadiusY
            const maxRadius =
              index === 0 || index === 2 ? maxRadiusX : maxRadiusY;
            return Math.max(0, Math.min(radius, maxRadius));
          });
        }
      }

      return borderRadiusValue;
    }

    function parseShape(el: Element, borderRadiusValue: number[] | undefined) {
      if (el.tagName.toLowerCase() === "img") {
        return borderRadiusValue &&
          borderRadiusValue.length === 4 &&
          borderRadiusValue.every((radius: number) => radius === 50)
          ? "circle"
          : "rectangle";
      }
      return undefined;
    }

    function parseFilters(computedStyles: CSSStyleDeclaration) {
      const filter = computedStyles.filter;
      if (!filter || filter === "none") {
        return undefined;
      }

      const filters: {
        invert?: number;
        brightness?: number;
        contrast?: number;
        saturate?: number;
        hueRotate?: number;
        blur?: number;
        grayscale?: number;
        sepia?: number;
        opacity?: number;
      } = {};

      // Parse filter functions
      const filterFunctions = filter.match(/[a-zA-Z]+\([^)]*\)/g);
      if (filterFunctions) {
        filterFunctions.forEach((func) => {
          const match = func.match(/([a-zA-Z]+)\(([^)]*)\)/);
          if (match) {
            const filterType = match[1];
            const value = parseFloat(match[2]);

            if (!isNaN(value)) {
              switch (filterType) {
                case "invert":
                  filters.invert = value;
                  break;
                case "brightness":
                  filters.brightness = value;
                  break;
                case "contrast":
                  filters.contrast = value;
                  break;
                case "saturate":
                  filters.saturate = value;
                  break;
                case "hue-rotate":
                  filters.hueRotate = value;
                  break;
                case "blur":
                  filters.blur = value;
                  break;
                case "grayscale":
                  filters.grayscale = value;
                  break;
                case "sepia":
                  filters.sepia = value;
                  break;
                case "opacity":
                  filters.opacity = value;
                  break;
              }
            }
          }
        });
      }

      // Return undefined if no filters were parsed
      return Object.keys(filters).length > 0 ? filters : undefined;
    }

    function cleanInnerText(text: string) {
      return text
        .replace(/\n/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/<br\s*\/?\>/gi, "\n");
    }

    function parseElementAttributes(el: Element) {
      let tagName = el.tagName.toLowerCase();

      const computedStyles = window.getComputedStyle(el);

      const position = parsePosition(el);

      const shadow = parseShadow(computedStyles);

      const background = parseBackground(computedStyles);

      const border = parseBorder(computedStyles);

      const font = parseFont(computedStyles);

      const lineHeight = parseLineHeight(computedStyles, el);

      const margin = parseMargin(computedStyles);

      const padding = parsePadding(computedStyles);

      let innerText = hasOnlyTextNodes(el)
        ? el.textContent || undefined
        : undefined;
      if (innerText) {
        innerText = cleanInnerText(innerText);
      }

      const zIndex = parseInt(computedStyles.zIndex);
      const zIndexValue = isNaN(zIndex) ? 0 : zIndex;

      let textAlign = computedStyles.textAlign as
        | "left"
        | "center"
        | "right"
        | "justify";

      // If display is flex and justify-content is center, force textAlign to center
      if (
        computedStyles.display === "flex" &&
        computedStyles.justifyContent === "center"
      ) {
        textAlign = "center";
      }
      if (computedStyles.placeItems === "center") {
        textAlign = "center";
      }
      const objectFit = computedStyles.objectFit as
        | "contain"
        | "cover"
        | "fill"
        | undefined;

      const parsedBackgroundImage = parseBackgroundImage(computedStyles);
      const imageSrc = (el as HTMLImageElement).src || parsedBackgroundImage;

      const borderRadiusValue = parseBorderRadius(computedStyles, el);

      const shape = parseShape(el, borderRadiusValue) as
        | "rectangle"
        | "circle"
        | undefined;

      const textWrap = computedStyles.whiteSpace !== "nowrap";

      const filters = parseFilters(computedStyles);

      const opacity = parseFloat(computedStyles.opacity);
      const elementOpacity = isNaN(opacity) ? undefined : opacity;

      const clipPath =
        computedStyles.clipPath === "none"
          ? undefined
          : computedStyles.clipPath;

      return {
        tagName: tagName,
        id: el.id,
        className:
          el.className && typeof el.className === "string"
            ? el.className
            : el.className
            ? el.className.toString()
            : undefined,
        innerText: innerText,
        opacity: elementOpacity,
        background: background,
        border: border,
        shadow: shadow,
        font: font,
        position: position,
        margin: margin,
        padding: padding,
        zIndex: zIndexValue,
        textAlign: textAlign !== "left" ? textAlign : undefined,
        lineHeight: lineHeight,
        borderRadius: borderRadiusValue,
        imageSrc: imageSrc,
        objectFit: objectFit,
        clip: false,
        overlay: undefined,
        shape: shape,
        connectorType: undefined,
        textWrap: textWrap,
        should_screenshot: false,
        element: undefined,
        filters: filters,
        clipPath: clipPath,
      };
    }

    return parseElementAttributes(el);
  });
  return attributes;
}
