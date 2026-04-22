"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import CreateProductModal from "@/components/CreateProductModal";
import { catalogApi, formatMoney, type Product } from "@/lib/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchProducts = useCallback(() => {
    let cancelled = false;
    setProducts(null);
    setError(null);
    catalogApi
      .listProducts()
      .then((p) => {
        if (!cancelled) setProducts(p);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = fetchProducts();
    return cancel;
  }, [fetchProducts]);

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    fetchProducts();
  };

  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Catalog</span>
          <h1>Products</h1>
        </div>
        <div className="actions">
          <span className="tag">
            {products ? `${products.length} items` : "Loading…"}
          </span>
          <button
            className="btn primary"
            onClick={() => setIsModalOpen(true)}
            aria-label="Create a new product"
          >
            Create Item
          </button>
        </div>
      </div>

      {error && (
        <div className="state error">
          We couldn't load the catalog. <code className="inline-code">{error}</code>
        </div>
      )}

      {!error && products === null && (
        <div className="grid" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 18, width: "60%" }} />
              <div
                className="skeleton"
                style={{ height: 14, width: "90%", marginTop: 12 }}
              />
              <div
                className="skeleton"
                style={{ height: 14, width: "75%", marginTop: 6 }}
              />
            </div>
          ))}
        </div>
      )}

      {products && products.length === 0 && (
        <div className="state">No products yet.</div>
      )}

      {products && products.length > 0 && (
        <div className="grid">
          {products.map((product) => {
            const available = product.stock > 0 && product.is_active;
            return (
              <article key={product.id} className="card">
                <span className="eyebrow">{product.category}</span>
                <div className="card-top">
                  <h2 className="title">{product.name}</h2>
                  <span className="price">
                    {formatMoney(Number(product.price), product.currency)}
                  </span>
                </div>
                <p className="desc">{product.description}</p>
                <div className="meta">
                  <span className={product.stock <= 5 ? "tag low" : "tag"}>
                    {product.stock > 0
                      ? `${product.stock} in stock`
                      : "Out of stock"}
                  </span>
                </div>
                <div className="actions">
                  <Link
                    href={`/products/${product.id}`}
                    className="btn ghost"
                    aria-label={`View ${product.name}`}
                  >
                    Details <span className="arrow">→</span>
                  </Link>
                  {available ? (
                    <Link
                      href={`/checkout?product_id=${product.id}`}
                      className="btn primary"
                      aria-label={`Buy ${product.name}`}
                    >
                      Buy Now
                    </Link>
                  ) : (
                    <button
                      className="btn primary"
                      disabled
                      aria-label="Unavailable"
                    >
                      Unavailable
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <CreateProductModal
          onSuccess={handleModalSuccess}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}
