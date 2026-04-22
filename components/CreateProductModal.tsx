"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { catalogApi, type ProductCreatePayload } from "@/lib/api";

interface CreateProductModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

type FormState = {
  name: string;
  description: string;
  price: string;
  currency: string;
  stock: string;
  category: string;
  image_url: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "USD",
  stock: "",
  category: "",
  image_url: "",
};

export default function CreateProductModal({
  onSuccess,
  onClose,
}: CreateProductModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus the first input when the modal mounts
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear the inline error for this field as the user types
    if (fieldErrors[name as keyof FormState]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setApiError(null);
  };

  const validate = (): FormErrors => {
    const errors: FormErrors = {};
    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);

    if (!form.name.trim()) {
      errors.name = "Name is required.";
    }
    if (form.price === "" || isNaN(price) || price <= 0) {
      errors.price = "Price must be a number greater than 0.";
    }
    if (form.stock === "" || isNaN(stock) || stock < 0) {
      errors.stock = "Stock must be a whole number of 0 or more.";
    }
    if (!form.category.trim()) {
      errors.category = "Category is required.";
    }

    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload: ProductCreatePayload = {
      name: form.name.trim(),
      price: parseFloat(form.price),
      stock: parseInt(form.stock, 10),
      category: form.category.trim(),
      currency: form.currency.trim() || "USD",
      ...(form.description.trim() && { description: form.description.trim() }),
      ...(form.image_url.trim() && { image_url: form.image_url.trim() }),
    };

    setSubmitting(true);
    try {
      await catalogApi.createProduct(payload);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError((err as Error).message);
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setApiError(null);
    onClose();
  };

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-panel">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Catalog</span>
            <h2 id="modal-title">New Product</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={handleCancel}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {apiError && (
          <div className="state error" role="alert">
            {apiError}
          </div>
        )}

        <form className="form modal-form" onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <label htmlFor="cpm-name">
            Name <span className="field-required" aria-hidden="true">*</span>
            <input
              ref={firstInputRef}
              id="cpm-name"
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Wireless Headphones"
              disabled={submitting}
              aria-required="true"
              aria-describedby={fieldErrors.name ? "cpm-name-error" : undefined}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <span id="cpm-name-error" className="field-error" role="alert">
                {fieldErrors.name}
              </span>
            )}
          </label>

          {/* Description */}
          <label htmlFor="cpm-description">
            Description
            <textarea
              id="cpm-description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Optional product description"
              disabled={submitting}
              rows={3}
            />
          </label>

          {/* Price + Currency */}
          <div className="modal-row">
            <label htmlFor="cpm-price">
              Price <span className="field-required" aria-hidden="true">*</span>
              <input
                id="cpm-price"
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                disabled={submitting}
                aria-required="true"
                aria-describedby={fieldErrors.price ? "cpm-price-error" : undefined}
                aria-invalid={!!fieldErrors.price}
              />
              {fieldErrors.price && (
                <span id="cpm-price-error" className="field-error" role="alert">
                  {fieldErrors.price}
                </span>
              )}
            </label>

            <label htmlFor="cpm-currency">
              Currency
              <input
                id="cpm-currency"
                type="text"
                name="currency"
                value={form.currency}
                onChange={handleChange}
                placeholder="USD"
                maxLength={3}
                disabled={submitting}
                className="currency-input"
              />
            </label>
          </div>

          {/* Stock + Category */}
          <div className="modal-row">
            <label htmlFor="cpm-stock">
              Stock <span className="field-required" aria-hidden="true">*</span>
              <input
                id="cpm-stock"
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                placeholder="0"
                min="0"
                step="1"
                disabled={submitting}
                aria-required="true"
                aria-describedby={fieldErrors.stock ? "cpm-stock-error" : undefined}
                aria-invalid={!!fieldErrors.stock}
              />
              {fieldErrors.stock && (
                <span id="cpm-stock-error" className="field-error" role="alert">
                  {fieldErrors.stock}
                </span>
              )}
            </label>

            <label htmlFor="cpm-category">
              Category <span className="field-required" aria-hidden="true">*</span>
              <input
                id="cpm-category"
                type="text"
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="e.g. Electronics"
                disabled={submitting}
                aria-required="true"
                aria-describedby={fieldErrors.category ? "cpm-category-error" : undefined}
                aria-invalid={!!fieldErrors.category}
              />
              {fieldErrors.category && (
                <span id="cpm-category-error" className="field-error" role="alert">
                  {fieldErrors.category}
                </span>
              )}
            </label>
          </div>

          {/* Image URL */}
          <label htmlFor="cpm-image-url">
            Image URL
            <input
              id="cpm-image-url"
              type="text"
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://example.com/image.jpg"
              disabled={submitting}
            />
          </label>

          <div className="modal-footer">
            <button
              type="button"
              className="btn"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
