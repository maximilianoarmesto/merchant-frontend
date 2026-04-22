/**
 * Component tests for CreateProductModal.
 *
 * Coverage:
 *  - Initial render: all expected fields are present
 *  - Validation: empty required fields show errors and do NOT call the API
 *  - Validation: negative price shows an error and does NOT call the API
 *  - Happy path: valid data calls createProduct with the correct payload
 *  - Loading state: Save button is disabled while submitting
 *  - API success: onSuccess and onClose are invoked
 *  - API error: error message is shown, modal stays open (onClose not called)
 *  - Cancel button: calls onClose, never calls the API
 *  - Backdrop click: calls onClose, never calls the API
 */

import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CreateProductModal from "../CreateProductModal";
import { catalogApi } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock the catalogApi module so we never hit the network
// ---------------------------------------------------------------------------
jest.mock("@/lib/api", () => ({
  catalogApi: {
    createProduct: jest.fn(),
  },
}));

const mockCreateProduct = catalogApi.createProduct as jest.MockedFunction<
  typeof catalogApi.createProduct
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default prop factories */
function makeProps(overrides: Partial<React.ComponentProps<typeof CreateProductModal>> = {}) {
  return {
    onSuccess: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
}

/** Render the modal with fresh mocks and a real userEvent instance */
function setup(overrides: Partial<React.ComponentProps<typeof CreateProductModal>> = {}) {
  const user = userEvent.setup();
  const props = makeProps(overrides);
  const utils = render(<CreateProductModal {...props} />);
  return { user, props, ...utils };
}

/** Fill every required field with valid values */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText(/name/i));
  await user.type(screen.getByLabelText(/name/i), "Wireless Headphones");

  await user.clear(screen.getByLabelText(/price/i));
  await user.type(screen.getByLabelText(/price/i), "49.99");

  await user.clear(screen.getByLabelText(/stock/i));
  await user.type(screen.getByLabelText(/stock/i), "10");

  await user.clear(screen.getByLabelText(/category/i));
  await user.type(screen.getByLabelText(/category/i), "Electronics");
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// 1. Initial render — all expected fields are present
// ===========================================================================
describe("initial render", () => {
  it("renders the modal heading", () => {
    setup();
    expect(screen.getByRole("heading", { name: /new product/i })).toBeInTheDocument();
  });

  it("renders a Name field", () => {
    setup();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it("renders a Description field", () => {
    setup();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("renders a Price field", () => {
    setup();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
  });

  it("renders a Currency field pre-filled with USD", () => {
    setup();
    const currencyInput = screen.getByLabelText(/currency/i);
    expect(currencyInput).toBeInTheDocument();
    expect(currencyInput).toHaveValue("USD");
  });

  it("renders a Stock field", () => {
    setup();
    expect(screen.getByLabelText(/stock/i)).toBeInTheDocument();
  });

  it("renders a Category field", () => {
    setup();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
  });

  it("renders an Image URL field", () => {
    setup();
    expect(screen.getByLabelText(/image url/i)).toBeInTheDocument();
  });

  it("renders Save and Cancel buttons", () => {
    setup();
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. Validation — empty required fields
// ===========================================================================
describe("validation: empty required fields", () => {
  it("shows an error for Name when it is blank on Save", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it("shows an error for Price when it is blank on Save", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/price must be a number greater than 0/i)).toBeInTheDocument();
  });

  it("shows an error for Stock when it is blank on Save", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/stock must be a whole number/i)).toBeInTheDocument();
  });

  it("shows an error for Category when it is blank on Save", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/category is required/i)).toBeInTheDocument();
  });

  it("does NOT call createProduct when required fields are empty", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText(/name is required/i);
    expect(mockCreateProduct).not.toHaveBeenCalled();
  });

  it("clears a field error as the user types into that field", async () => {
    const { user } = setup();

    // Trigger validation
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();

    // Start typing in the Name field — error should disappear
    await user.type(screen.getByLabelText(/name/i), "a");
    expect(screen.queryByText(/name is required/i)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 3. Validation — negative price
// ===========================================================================
describe("validation: negative price", () => {
  it("shows a price error when price is negative", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/price/i), "-5");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/price must be a number greater than 0/i)).toBeInTheDocument();
  });

  it("shows a price error when price is zero", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/price/i), "0");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/price must be a number greater than 0/i)).toBeInTheDocument();
  });

  it("does NOT call createProduct when price is negative", async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText(/name/i), "Widget");
    await user.type(screen.getByLabelText(/price/i), "-1");
    await user.type(screen.getByLabelText(/stock/i), "5");
    await user.type(screen.getByLabelText(/category/i), "Gadgets");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText(/price must be a number greater than 0/i);
    expect(mockCreateProduct).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. Happy path — valid data calls createProduct with the correct payload
// ===========================================================================
describe("successful submission", () => {
  beforeEach(() => {
    // Resolve immediately to simulate a fast successful API response
    mockCreateProduct.mockResolvedValue({
      id: 1,
      name: "Wireless Headphones",
      description: "",
      price: 49.99,
      currency: "USD",
      stock: 10,
      category: "Electronics",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });
  });

  it("calls createProduct with the correct payload for required fields only", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockCreateProduct).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateProduct).toHaveBeenCalledWith({
      name: "Wireless Headphones",
      price: 49.99,
      stock: 10,
      category: "Electronics",
      currency: "USD",
    });
  });

  it("includes description in the payload when provided", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.type(screen.getByLabelText(/description/i), "Great sound quality");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalledTimes(1));

    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Great sound quality" }),
    );
  });

  it("includes image_url in the payload when provided", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.type(
      screen.getByLabelText(/image url/i),
      "https://example.com/img.jpg",
    );
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalledTimes(1));

    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "https://example.com/img.jpg" }),
    );
  });

  it("does NOT include description when it is blank", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalledTimes(1));

    const [payload] = mockCreateProduct.mock.calls[0];
    expect(payload).not.toHaveProperty("description");
  });

  it("does NOT include image_url when it is blank", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalledTimes(1));

    const [payload] = mockCreateProduct.mock.calls[0];
    expect(payload).not.toHaveProperty("image_url");
  });

  it("uses the custom currency when changed by the user", async () => {
    const { user } = setup();

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/currency/i));
    await user.type(screen.getByLabelText(/currency/i), "EUR");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockCreateProduct).toHaveBeenCalledTimes(1));

    expect(mockCreateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "EUR" }),
    );
  });
});

// ===========================================================================
// 5. Loading state — Save button is disabled while saving
// ===========================================================================
describe("loading state while saving", () => {
  it("disables the Save button while the API call is in flight", async () => {
    // Create a promise we control so the request stays pending indefinitely.
    // We expose both resolve/reject handles so we can settle it for test cleanup.
    let settle!: (value: Awaited<ReturnType<typeof catalogApi.createProduct>>) => void;
    const pendingPromise = new Promise<Awaited<ReturnType<typeof catalogApi.createProduct>>>(
      (resolve) => { settle = resolve; },
    );
    mockCreateProduct.mockReturnValueOnce(pendingPromise);

    const props = makeProps();
    const user = userEvent.setup();
    render(<CreateProductModal {...props} />);

    await fillValidForm(user);

    // Click save — the async API call begins, component enters submitting=true
    await user.click(screen.getByRole("button", { name: /save/i }));

    // The button label changes to "Saving…" and must be disabled
    const savingBtn = await screen.findByRole("button", { name: /saving…/i });
    expect(savingBtn).toBeDisabled();

    // Cleanup: settle the promise so the async work completes cleanly.
    // After success the component calls onSuccess() + onClose() (both mocked,
    // so the component stays mounted with submitting=true — that is correct
    // behaviour; the parent would unmount it in a real app).
    settle({
      id: 1, name: "Widget", description: "", price: 9.99,
      currency: "USD", stock: 5, category: "Misc",
      is_active: true, created_at: "", updated_at: "",
    });
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
  });

  it("also disables the Cancel button while saving", async () => {
    let settle!: (value: Awaited<ReturnType<typeof catalogApi.createProduct>>) => void;
    const pendingPromise = new Promise<Awaited<ReturnType<typeof catalogApi.createProduct>>>(
      (resolve) => { settle = resolve; },
    );
    mockCreateProduct.mockReturnValueOnce(pendingPromise);

    const props = makeProps();
    const user = userEvent.setup();
    render(<CreateProductModal {...props} />);

    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /save/i }));

    // While in-flight, the Cancel button must also be disabled
    await screen.findByRole("button", { name: /saving…/i });
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    // Cleanup
    settle({
      id: 2, name: "Widget", description: "", price: 9.99,
      currency: "USD", stock: 1, category: "Misc",
      is_active: true, created_at: "", updated_at: "",
    });
    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
  });
});

// ===========================================================================
// 6. API success — onSuccess and onClose are called
// ===========================================================================
describe("API success callbacks", () => {
  it("calls onSuccess after a successful submission", async () => {
    mockCreateProduct.mockResolvedValueOnce({
      id: 1,
      name: "Wireless Headphones",
      description: "",
      price: 49.99,
      currency: "USD",
      stock: 10,
      category: "Electronics",
      is_active: true,
      created_at: "",
      updated_at: "",
    });

    const { user, props } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledTimes(1));
  });

  it("calls onClose after a successful submission", async () => {
    mockCreateProduct.mockResolvedValueOnce({
      id: 1,
      name: "Wireless Headphones",
      description: "",
      price: 49.99,
      currency: "USD",
      stock: 10,
      category: "Electronics",
      is_active: true,
      created_at: "",
      updated_at: "",
    });

    const { user, props } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });
});

// ===========================================================================
// 7. API error — error message shown, modal stays open
// ===========================================================================
describe("API error handling", () => {
  it("displays the API error message when createProduct rejects", async () => {
    mockCreateProduct.mockRejectedValueOnce(new Error("500 Internal Server Error"));

    const { user } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByText(/500 internal server error/i),
    ).toBeInTheDocument();
  });

  it("shows the error in an alert role element", async () => {
    mockCreateProduct.mockRejectedValueOnce(new Error("Service unavailable"));

    const { user } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    const alert = await screen.findByRole("alert", {
      // The modal field errors also use role="alert"; narrow to the API error
      name: (_, el) => el.className?.includes("error") || el.classList.contains("error"),
    });
    expect(alert).toHaveTextContent(/service unavailable/i);
  });

  it("does NOT call onClose when the API returns an error", async () => {
    mockCreateProduct.mockRejectedValueOnce(new Error("Network error"));

    const { user, props } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText(/network error/i);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("re-enables the Save button after an API error so the user can retry", async () => {
    mockCreateProduct.mockRejectedValueOnce(new Error("Timeout"));

    const { user } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText(/timeout/i);
    expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("clears the API error message when the user starts typing again", async () => {
    mockCreateProduct.mockRejectedValueOnce(new Error("Bad gateway"));

    const { user } = setup();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /save/i }));

    await screen.findByText(/bad gateway/i);

    // Type into any field — the error should clear
    await user.type(screen.getByLabelText(/name/i), "x");
    expect(screen.queryByText(/bad gateway/i)).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 8. Cancel behaviour
// ===========================================================================
describe("Cancel behaviour", () => {
  it("calls onClose when the Cancel button is clicked", async () => {
    const { user, props } = setup();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call createProduct when Cancel is clicked", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockCreateProduct).not.toHaveBeenCalled();
  });

  it("calls onClose when the ✕ close icon button is clicked", async () => {
    const { user, props } = setup();

    await user.click(screen.getByRole("button", { name: /close modal/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call createProduct when the ✕ close icon button is clicked", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: /close modal/i }));

    expect(mockCreateProduct).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 9. Backdrop click — calls onClose without calling the API
// ===========================================================================
describe("backdrop click behaviour", () => {
  it("calls onClose when the backdrop (outside the panel) is clicked", async () => {
    const { user, props } = setup();

    // The backdrop is the outermost div with role="dialog"
    const backdrop = screen.getByRole("dialog");
    await user.click(backdrop);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call createProduct when the backdrop is clicked", async () => {
    const { user } = setup();

    const backdrop = screen.getByRole("dialog");
    await user.click(backdrop);

    expect(mockCreateProduct).not.toHaveBeenCalled();
  });

  it("does NOT call onClose when clicking inside the modal panel", async () => {
    const { user, props } = setup();

    // Clicking the heading (inside the panel) should not close the modal
    await user.click(screen.getByRole("heading", { name: /new product/i }));

    expect(props.onClose).not.toHaveBeenCalled();
  });
});
