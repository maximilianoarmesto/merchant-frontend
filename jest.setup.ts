import "@testing-library/jest-dom";

// React 18 + jsdom emit "act(...) is not supported in production builds" or
// "not wrapped in act(...)" warnings for state updates triggered by user-event
// through jsdom's native event dispatching path.  These are cosmetic artefacts
// of the test environment — all assertions are still correct — so we silence
// them here rather than pollute test output.
const originalError = console.error.bind(console);
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("not wrapped in act(") ||
      msg.includes("act(...) is not supported in production builds")
    ) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
