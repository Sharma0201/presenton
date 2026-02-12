"use client";

import React, { useRef, useEffect, useState, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { marked } from "marked";

interface MarkdownTextRendererProps {
  children: ReactNode;
  slideData?: any;
}

const MarkdownTextRenderer: React.FC<MarkdownTextRendererProps> = ({
  children,
  slideData,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [processedElements, setProcessedElements] = useState(
    new Set<HTMLElement>()
  );
  const rootsRef = useRef<Map<HTMLElement, { root: any; dataPath: string }>>(
    new Map()
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const replaceTextElements = async () => {
      // Get all elements in the container
      const allElements = container.querySelectorAll("*");

      for (const element of allElements) {
        const htmlElement = element as HTMLElement;

        // Skip if already processed
        if (
          processedElements.has(htmlElement) ||
          htmlElement.classList.contains("markdown-rendered") ||
          htmlElement.closest(".markdown-rendered")
        ) {
          continue;
        }

        // Skip if element is inside an ignored element tree
        if (isInIgnoredElementTree(htmlElement)) continue;

        // Get direct text content (not from child elements)
        const directTextContent = getDirectTextContent(htmlElement);
        const trimmedText = directTextContent.trim();

        // Check if element has meaningful text content
        if (!trimmedText || trimmedText.length <= 2) continue;

        // Skip elements that contain other elements with text (to avoid double processing)
        if (hasTextChildren(htmlElement)) continue;

        // Skip certain element types that shouldn't be processed
        if (shouldSkipElement(htmlElement)) continue;

        // Get all computed styles to preserve them
        const allClasses = Array.from(htmlElement.classList);
        const allStyles = htmlElement.getAttribute("style");

        const dataPath = findDataPath(slideData, trimmedText);

        // Get the actual content from slideData or use trimmed text
        const content = dataPath.path
          ? getValueByPath(slideData, dataPath.path) ?? trimmedText
          : trimmedText;

        // Check if content contains markdown
        if (hasMarkdown(content)) {
          try {
            // Parse markdown to HTML
            const htmlContent = await marked.parse(content, { async: true });

            // Create a container for the rendered markdown
            const markdownContainer = document.createElement("span");
            markdownContainer.style.cssText = allStyles || "";
            markdownContainer.className = Array.from(allClasses).join(" ") + " markdown-rendered";
            markdownContainer.innerHTML = htmlContent;

            // Replace the element
            if (htmlElement.parentNode) {
              htmlElement.parentNode.replaceChild(
                markdownContainer,
                htmlElement
              );
              htmlElement.innerHTML = "";
            }
          } catch (error) {
            console.error("Error parsing markdown:", error);
            // If markdown parsing fails, just show the raw text
          }
        }

        setProcessedElements((prev) => new Set(prev).add(htmlElement));
      }
    };

    // Replace text elements after a short delay to ensure DOM is ready
    const timer = setTimeout(replaceTextElements, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [slideData]);

  // Helper function to check if text contains markdown
  const hasMarkdown = (text: string): boolean => {
    if (!text) return false;
    // Check for common markdown patterns
    const markdownPatterns = [
      /\*\*.*\*\*/,       // Bold **text**
      /\*.*\*/,           // Italic *text*
      /__.*__/,           // Bold __text__
      /_.*_/,             // Italic _text_
      /~~.*~~/,           // Strikethrough ~~text~~
      /`.*`/,             // Code `text`
      /\[.*\]\(.*\)/,     // Links [text](url)
      /^#+\s/m,           // Headers # text
      /^\-\s/m,           // Lists - item
      /^\*\s/m,           // Lists * item
      /^\d+\.\s/m,        // Numbered lists 1. item
    ];
    return markdownPatterns.some((pattern) => pattern.test(text));
  };

  // Helper functions (same as TiptapTextReplacer)
  const isInIgnoredElementTree = (element: HTMLElement): boolean => {
    const ignoredElementTypes = [
      "TABLE",
      "TBODY",
      "THEAD",
      "TFOOT",
      "TR",
      "TD",
      "TH",
      "SVG",
      "G",
      "PATH",
      "CIRCLE",
      "RECT",
      "LINE",
      "CANVAS",
      "VIDEO",
      "AUDIO",
      "IFRAME",
      "EMBED",
      "OBJECT",
      "SELECT",
      "OPTION",
      "OPTGROUP",
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
    ];

    const ignoredClassPatterns = [
      "chart",
      "graph",
      "visualization",
      "menu",
      "dropdown",
      "tooltip",
      "editor",
      "wysiwyg",
      "calendar",
      "datepicker",
      "slider",
      "carousel",
      "flowchart",
      "mermaid",
      "diagram",
    ];

    let currentElement: HTMLElement | null = element;
    while (currentElement) {
      if (ignoredElementTypes.includes(currentElement.tagName)) {
        return true;
      }

      const className =
        currentElement.className.length > 0
          ? currentElement.className.toLowerCase()
          : "";
      if (
        ignoredClassPatterns.some((pattern) => className.includes(pattern))
      ) {
        return true;
      }
      if (currentElement.id.includes("mermaid")) {
        return true;
      }

      if (
        currentElement.hasAttribute("contenteditable") ||
        currentElement.hasAttribute("data-chart") ||
        currentElement.hasAttribute("data-visualization") ||
        currentElement.hasAttribute("data-interactive")
      ) {
        return true;
      }

      currentElement = currentElement.parentElement;
    }
    return false;
  };

  const getValueByPath = (obj: any, path: string): any => {
    if (!obj || !path) return undefined;
    const tokens = path
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter(Boolean);
    let current: any = obj;
    for (const token of tokens) {
      if (current == null) return undefined;
      current = current[token as keyof typeof current];
    }
    return current;
  };

  const getDirectTextContent = (element: HTMLElement): string => {
    let text = "";
    const childNodes = Array.from(element.childNodes);
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      }
    }
    return text;
  };

  const hasTextChildren = (element: HTMLElement): boolean => {
    const children = Array.from(element.children) as HTMLElement[];
    return children.some((child) => {
      const childText = getDirectTextContent(child).trim();
      return childText.length > 1;
    });
  };

  const shouldSkipElement = (element: HTMLElement): boolean => {
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName)) {
      return true;
    }

    if (
      element.hasAttribute("role") ||
      element.hasAttribute("aria-label") ||
      element.hasAttribute("data-testid")
    ) {
      return true;
    }

    if (
      element.querySelector(
        "img, svg, button, input, textarea, select, a[href]"
      )
    ) {
      return true;
    }

    const containerClasses = [
      "grid",
      "flex",
      "space-",
      "gap-",
      "container",
      "wrapper",
    ];
    const hasContainerClass = containerClasses.some((cls) =>
      element.className.length > 0 ? element.className.includes(cls) : false
    );
    if (hasContainerClass) return true;

    const text = getDirectTextContent(element).trim();
    if (text.length < 3) return true;

    return false;
  };

  const findDataPath = (
    data: any,
    targetText: string,
    path = ""
  ): {
    path: string;
    originalText: string;
  } => {
    if (!data || typeof data !== "object")
      return { path: "", originalText: "" };

    for (const [key, value] of Object.entries(data)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === "string" && value.trim() === targetText.trim()) {
        return { path: currentPath, originalText: value };
      }

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const result = findDataPath(
            value[i],
            targetText,
            `${currentPath}[${i}]`
          );
          if (result.path) return result;
        }
      } else if (typeof value === "object" && value !== null) {
        const result = findDataPath(value, targetText, currentPath);
        if (result.path) return result;
      }
    }
    return { path: "", originalText: "" };
  };

  return (
    <div ref={containerRef} className="markdown-text-renderer">
      {children}
    </div>
  );
};

export default MarkdownTextRenderer;
