/**
 * Unit tests for lib/ai-config.ts
 *
 * Strategy
 * --------
 * The module uses Node.js `fs` (readFileSync / writeFileSync).  We mock the
 * entire `fs` module with jest.mock so that no real file-system I/O occurs.
 * Each test group programs the mock's return values or spy implementations
 * and then asserts the behaviour of readConfig() / writeConfig().
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Mock Node.js `fs` — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------
jest.mock("fs");

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

// ---------------------------------------------------------------------------
// Import module under test *after* mocking
// ---------------------------------------------------------------------------
import { readConfig, writeConfig } from "../ai-config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIG_PATH = path.resolve(process.cwd(), ".ai-config.json");

function mockFileContent(content: object | string) {
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  mockReadFileSync.mockReturnValueOnce(raw as unknown as Buffer);
}

function mockFileNotFound() {
  mockReadFileSync.mockImplementationOnce(() => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// readConfig
// ===========================================================================

describe("readConfig()", () => {
  // -------------------------------------------------------------------------
  // File not found
  // -------------------------------------------------------------------------
  describe("when config file does not exist", () => {
    it("returns null for apiKey", () => {
      mockFileNotFound();
      expect(readConfig().apiKey).toBeNull();
    });

    it("returns null for model", () => {
      mockFileNotFound();
      expect(readConfig().model).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Empty / invalid JSON
  // -------------------------------------------------------------------------
  describe("when config file contains invalid JSON", () => {
    it("returns null for apiKey", () => {
      mockReadFileSync.mockReturnValueOnce("not-json" as unknown as Buffer);
      expect(readConfig().apiKey).toBeNull();
    });

    it("returns null for model", () => {
      mockReadFileSync.mockReturnValueOnce("not-json" as unknown as Buffer);
      expect(readConfig().model).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Empty object stored in file
  // -------------------------------------------------------------------------
  describe("when config file is an empty JSON object", () => {
    it("returns null for apiKey", () => {
      mockFileContent({});
      expect(readConfig().apiKey).toBeNull();
    });

    it("returns null for model", () => {
      mockFileContent({});
      expect(readConfig().model).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fully populated config
  // -------------------------------------------------------------------------
  describe("when config file contains both apiKey and model", () => {
    it("returns the stored apiKey", () => {
      mockFileContent({ apiKey: "sk-test-key", model: "gpt-4o" });
      expect(readConfig().apiKey).toBe("sk-test-key");
    });

    it("returns the stored model", () => {
      mockFileContent({ apiKey: "sk-test-key", model: "gpt-4o" });
      expect(readConfig().model).toBe("gpt-4o");
    });
  });

  // -------------------------------------------------------------------------
  // Partially populated config
  // -------------------------------------------------------------------------
  describe("when config file contains only apiKey", () => {
    it("returns the stored apiKey", () => {
      mockFileContent({ apiKey: "sk-only-key" });
      expect(readConfig().apiKey).toBe("sk-only-key");
    });

    it("returns null for model", () => {
      mockFileContent({ apiKey: "sk-only-key" });
      expect(readConfig().model).toBeNull();
    });
  });

  describe("when config file contains only model", () => {
    it("returns null for apiKey", () => {
      mockFileContent({ model: "gpt-3.5-turbo" });
      expect(readConfig().apiKey).toBeNull();
    });

    it("returns the stored model", () => {
      mockFileContent({ model: "gpt-3.5-turbo" });
      expect(readConfig().model).toBe("gpt-3.5-turbo");
    });
  });

  // -------------------------------------------------------------------------
  // Empty-string values are treated as unset
  // -------------------------------------------------------------------------
  describe("when stored values are empty strings", () => {
    it("returns null for an empty-string apiKey", () => {
      mockFileContent({ apiKey: "", model: "gpt-4o" });
      expect(readConfig().apiKey).toBeNull();
    });

    it("returns null for an empty-string model", () => {
      mockFileContent({ apiKey: "sk-key", model: "" });
      expect(readConfig().model).toBeNull();
    });
  });
});

// ===========================================================================
// writeConfig
// ===========================================================================

describe("writeConfig()", () => {
  describe("when no existing file is present", () => {
    beforeEach(() => {
      mockFileNotFound();
      mockWriteFileSync.mockImplementation(() => undefined);
    });

    it("calls writeFileSync with the correct file path", () => {
      writeConfig({ apiKey: "sk-new", model: "gpt-4o" });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        expect.any(String),
        "utf-8",
      );
    });

    it("persists the provided apiKey in the written JSON", () => {
      writeConfig({ apiKey: "sk-new", model: "gpt-4o" });
      const [, written] = mockWriteFileSync.mock.calls[0] as [string, string, string];
      expect(JSON.parse(written)).toMatchObject({ apiKey: "sk-new" });
    });

    it("persists the provided model in the written JSON", () => {
      writeConfig({ apiKey: "sk-new", model: "gpt-4o" });
      const [, written] = mockWriteFileSync.mock.calls[0] as [string, string, string];
      expect(JSON.parse(written)).toMatchObject({ model: "gpt-4o" });
    });

    it("writes exactly one file", () => {
      writeConfig({ apiKey: "sk-new", model: "gpt-4o" });
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe("when an existing config file is present", () => {
    it("merges new values on top of the existing config", () => {
      // readFileSync returns the existing config
      mockFileContent({ apiKey: "sk-old", model: "gpt-3.5-turbo" });
      mockWriteFileSync.mockImplementation(() => undefined);

      writeConfig({ apiKey: "sk-new", model: "gpt-4o" });

      const [, written] = mockWriteFileSync.mock.calls[0] as [string, string, string];
      expect(JSON.parse(written)).toMatchObject({ apiKey: "sk-new", model: "gpt-4o" });
    });

    it("does not silently drop the apiKey when only the model changes", () => {
      mockFileContent({ apiKey: "sk-existing", model: "gpt-3.5-turbo" });
      mockWriteFileSync.mockImplementation(() => undefined);

      // Simulate an update that supplies both fields (writeConfig requires both)
      writeConfig({ apiKey: "sk-existing", model: "gpt-4o" });

      const [, written] = mockWriteFileSync.mock.calls[0] as [string, string, string];
      expect(JSON.parse(written)).toMatchObject({ apiKey: "sk-existing", model: "gpt-4o" });
    });
  });

  describe("when writeFileSync throws", () => {
    it("propagates the error to the caller", () => {
      mockFileNotFound();
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error("EACCES: permission denied");
      });

      expect(() => writeConfig({ apiKey: "sk-new", model: "gpt-4o" })).toThrow(
        "EACCES: permission denied",
      );
    });
  });
});
