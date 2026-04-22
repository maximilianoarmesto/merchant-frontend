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
};

const INITIAL_FORM: FormState = {
  name: "",
  description: "",
  price: "",
  currency: "USD",
  stock: "",
  category: "",
};

export default function CreateProductModal({
  onSuccess,
  onClose,
}: CreateProductModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const price = parseFloat(form.price);
    const stock = parseInt(form.stock, 10);

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (isNaN(price) || price < 0) {
      setError("Price must be a valid non-negative number.");
      return;
    }
    if (isNaN(stock) || stock < 0) {
      setError("Stock must be a valid non-negative integer.");
      return;
    }
    if (!form.category.trim()) {
      setError("Category is required.");
      return;
    }

    const payload: ProductCreatePayload = {
      name: form.name.trim(),
      price,
      stock,
      category: form.category.trim(),
      currency: form.currency.trim() || "USD",
      description: form.description.trim() || null,
    };

    setSubmitting(true);
    try {
      await catalogApi.createProduct(payload);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
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
            <span className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              Catalog
            </span>
            <h2 id="modal-title" style={{ fontSize: "1.35rem" }}>
              Create Item
            </h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            aria-label="Close modal"
            style={{ padding: "0.4rem 0.6rem" }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="state error" style={{ padding: "0.75rem 1rem", marginBottom: "1.25rem", textAlign: "left" }}>
            {error}
          </div>
        )}

        <form className="form" onSubmit={handleSubmit} style={{ maxWidth: "100%" }}>
          <label>
            Name <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
            <input
              ref={firstInputRef}
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Wireless Headphones"
              disabled={submitting}
              required
            />
          </label>

          <label>
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Optional product description"
              disabled={submitting}
              rows={3}
              style={{
                font: "inherit",
                fontSize: 15,
                color: "var(--fg)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "0.7rem 0.85rem",
                borderRadius: "var(--radius)",
                outline: "none",
                resize: "vertical",
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
            />
          </label>

          <div className="modal-row">
            <label style={{ flex: 1 }}>
              Price <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={submitting}
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              Currency
              <input
                type="text"
                name="currency"
                value={form.currency}
                onChange={handleChange}
                placeholder="USD"
                maxLength={3}
                disabled={submitting}
                style={{ textTransform: "uppercase" }}
              />
            </label>
          </div>

          <div className="modal-row">
            <label style={{ flex: 1 }}>
              Stock <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                placeholder="0"
                min="0"
                step="1"
                disabled={submitting}
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              Category <span aria-hidden="true" style={{ color: "var(--danger)" }}>*</span>
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="e.g. Electronics"
                disabled={submitting}
                required
              />
            </label>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
