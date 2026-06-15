/**
 * @jest-environment jsdom
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
// React 18.3 exports `act` at runtime; @types/react 18.3.3 hasn't picked it up yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { act } = require("react") as { act: any };

import ChatWidget from "@/components/ChatWidget";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface TestHarness {
  container: HTMLDivElement;
  root: Root;
  render: (ui: React.ReactElement) => Promise<void>;
  cleanup: () => void;
}

function setup(): TestHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    container,
    root,
    async render(ui) {
      await act(async () => {
        root.render(ui);
      });
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function btn(h: TestHarness): HTMLButtonElement {
  return h.container.querySelector(
    '[data-testid="chat-widget-button"]'
  ) as HTMLButtonElement;
}

function panel(h: TestHarness): HTMLElement | null {
  return h.container.querySelector('[data-testid="chat-widget-panel"]');
}

describe("ChatWidget", () => {
  it("renders the floating button collapsed by default (panel not mounted)", async () => {
    const h = setup();
    try {
      await h.render(<ChatWidget />);
      expect(btn(h)).not.toBeNull();
      expect(btn(h).getAttribute("aria-expanded")).toBe("false");
      expect(panel(h)).toBeNull();
    } finally {
      h.cleanup();
    }
  });

  it("opens the panel when the button is clicked", async () => {
    const h = setup();
    try {
      await h.render(<ChatWidget />);
      await click(btn(h));
      const p = panel(h);
      expect(p).not.toBeNull();
      expect(p!.getAttribute("data-open")).toBe("true");
      expect(btn(h).getAttribute("aria-expanded")).toBe("true");
    } finally {
      h.cleanup();
    }
  });

  it("begins the close animation when toggled off", async () => {
    const h = setup();
    try {
      await h.render(<ChatWidget />);
      await click(btn(h)); // open
      await click(btn(h)); // close
      const p = panel(h);
      // Still mounted (closing animation) but marked closed.
      expect(p).not.toBeNull();
      expect(p!.getAttribute("data-open")).toBe("false");
      expect(p!.className).toContain("closing");
      expect(btn(h).getAttribute("aria-expanded")).toBe("false");
    } finally {
      h.cleanup();
    }
  });
});
