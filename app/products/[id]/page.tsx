"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { catalogApi, formatMoney, type Product } from "@/lib/api";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    catalogApi
      .getProduct(id)
      .then((p) => {
        if (!cancelled) setProduct(p);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const goToCheckout = () => {
    if (!product) return;
    router.push(`/checkout?product_id=${product.id}`);
  };

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <Link href="/products" className="btn ghost">
          ← Back to catalog
        </Link>
      </div>

      {error && (
        <div className="state error">
          Unable to load product. <code className="inline-code">{error}</code>
        </div>
      )}

      {!error && product === null && (
        <div className="detail">
          <div>
            <div
              className="skeleton"
              style={{ height: 18, width: 120, marginBottom: 20 }}
            />
            <div
              className="skeleton"
              style={{ height: 52, width: "70%", marginBottom: 24 }}
            />
            <div className="skeleton" style={{ height: 14, width: "90%" }} />
            <div
              className="skeleton"
              style={{ height: 14, width: "75%", marginTop: 8 }}
            />
          </div>
          <aside>
            <div className="panel skeleton" style={{ height: 200 }} />
          </aside>
        </div>
      )}

      {product && (
        <div className="detail">
          <div>
            <span className="eyebrow">{product.category}</span>
            <h1 style={{ marginBottom: "1.25rem" }}>{product.name}</h1>
            <p
              className="muted"
              style={{
                fontSize: "1.05rem",
                lineHeight: 1.6,
                maxWidth: 620,
              }}
            >
              {product.description}
            </p>

            <hr className="divider" style={{ margin: "2.5rem 0" }} />

            <dl className="kv" style={{ maxWidth: 520 }}>
              <dt>Price</dt>
              <dd>{formatMoney(Number(product.price), product.currency)}</dd>
              <dt>Currency</dt>
              <dd>{product.currency}</dd>
              <dt>Stock</dt>
              <dd>{product.stock}</dd>
              <dt>Category</dt>
              <dd>{product.category}</dd>
              <dt>Status</dt>
              <dd>{product.is_active ? "Active" : "Inactive"}</dd>
              <dt>Product ID</dt>
              <dd className="mono">#{product.id}</dd>
            </dl>
          </div>

          <aside>
            <div className="panel">
              <span className="eyebrow">Purchase</span>
              <div className="price-big">
                {formatMoney(Number(product.price), product.currency)}
              </div>
              <p className="muted" style={{ marginTop: "0.5rem" }}>
                Simulated payment — no card required.
              </p>
              <hr className="divider" />
              <button
                className="btn primary block"
                onClick={goToCheckout}
                disabled={product.stock <= 0 || !product.is_active}
              >
                Buy Now <span className="arrow">→</span>
              </button>
              {(product.stock <= 0 || !product.is_active) && (
                <p className="empty-hint">
                  Not available for purchase right now.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
