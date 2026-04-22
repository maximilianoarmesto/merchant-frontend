"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import {
  catalogApi,
  checkoutApi,
  formatMoney,
  type CheckoutSession,
  type Order,
  type Product,
} from "@/lib/api";

type Status = "idle" | "loading" | "creating" | "paying" | "paid" | "error";

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="state">Loading checkout…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const productIdParam = params?.get("product_id") || "";

  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<Status>(
    productIdParam ? "loading" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productIdParam) {
      setSelected(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    catalogApi
      .getProduct(productIdParam)
      .then((p) => {
        if (cancelled) return;
        setSelected(p);
        setStatus("idle");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [productIdParam]);

  const createSession = async () => {
    if (!selected) return;
    setError(null);
    setStatus("creating");
    try {
      const s = await checkoutApi.createSession(selected.id, quantity);
      setSession(s);
      setStatus("idle");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const pay = async () => {
    if (!session) return;
    setError(null);
    setStatus("paying");
    try {
      const o = await checkoutApi.paySession(session.id);
      setOrder(o);
      setStatus("paid");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  const reset = () => {
    setSession(null);
    setOrder(null);
    setStatus("idle");
    setError(null);
  };

  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Checkout</span>
          <h1>Checkout</h1>
        </div>
      </div>

      {error && <div className="state error">{error}</div>}

      {status === "paid" && order ? (
        <div className="detail">
          <div>
            <div className="panel">
              <span className="eyebrow">Order created</span>
              <h2 style={{ marginBottom: "0.75rem" }}>
                Order #{order.id}
              </h2>
              <p className="muted" style={{ marginBottom: "1.5rem" }}>
                Payment complete.
              </p>
              <hr className="divider" />
              <dl className="kv">
                <dt>Product</dt>
                <dd>{order.product_name}</dd>
                <dt>Quantity</dt>
                <dd>{order.quantity}</dd>
                <dt>Total</dt>
                <dd>
                  {formatMoney(Number(order.total_amount), order.currency)}
                </dd>
                <dt>Payment</dt>
                <dd>
                  <span className="tag paid">{order.payment_status}</span>
                </dd>
                <dt>Status</dt>
                <dd>
                  <span className="tag">{order.order_status}</span>
                </dd>
              </dl>
              <hr className="divider" />
              <div className="row" style={{ gap: "0.75rem" }}>
                <Link href="/products" className="btn">
                  Keep shopping
                </Link>
                <Link href="/orders" className="btn primary">
                  View orders <span className="arrow">→</span>
                </Link>
              </div>
            </div>
          </div>
          <aside />
        </div>
      ) : (
        <div className="detail">
          <div>
            <div className="panel">
              <span className="eyebrow">Your item</span>
              {status === "loading" && (
                <>
                  <div
                    className="skeleton"
                    style={{ height: 24, width: "50%", marginBottom: 12 }}
                  />
                  <div
                    className="skeleton"
                    style={{ height: 14, width: "80%", marginBottom: 8 }}
                  />
                  <div
                    className="skeleton"
                    style={{ height: 14, width: "60%" }}
                  />
                </>
              )}
              {status !== "loading" && !selected && (
                <>
                  <h2 style={{ marginBottom: "0.5rem" }}>
                    Pick a product first.
                  </h2>
                  <p className="muted">
                    Choose an item from the catalog to start a checkout.
                  </p>
                  <hr className="divider" />
                  <Link href="/products" className="btn primary">
                    Browse products <span className="arrow">→</span>
                  </Link>
                </>
              )}
              {selected && (
                <form
                  className="form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createSession();
                  }}
                  style={{ maxWidth: "100%" }}
                >
                  <h2 style={{ marginBottom: "0.5rem" }}>{selected.name}</h2>
                  <p className="muted" style={{ marginBottom: "1.25rem" }}>
                    {selected.description}
                  </p>
                  <dl className="kv" style={{ marginBottom: "1.25rem" }}>
                    <dt>Unit price</dt>
                    <dd>
                      {formatMoney(Number(selected.price), selected.currency)}
                    </dd>
                    <dt>Category</dt>
                    <dd>{selected.category}</dd>
                    <dt>In stock</dt>
                    <dd>{selected.stock}</dd>
                  </dl>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, selected.stock)}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.min(
                            Math.max(1, Number(e.target.value) || 1),
                            Math.max(1, selected.stock),
                          ),
                        )
                      }
                      disabled={!!session || status === "creating"}
                    />
                  </label>
                  {!session && (
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={
                        status === "creating" ||
                        !selected.is_active ||
                        selected.stock <= 0
                      }
                    >
                      {status === "creating" ? "Starting…" : "Checkout"}{" "}
                      <span className="arrow">→</span>
                    </button>
                  )}
                </form>
              )}
            </div>
          </div>

          <aside>
            <div className="panel tight">
              <span className="eyebrow">Summary</span>
              {!session && selected && (
                <>
                  <dl className="kv">
                    <dt>Item</dt>
                    <dd>{selected.name}</dd>
                    <dt>Unit price</dt>
                    <dd>
                      {formatMoney(Number(selected.price), selected.currency)}
                    </dd>
                    <dt>Quantity</dt>
                    <dd>{quantity}</dd>
                  </dl>
                  <hr className="divider" />
                  <div className="spaced">
                    <span className="muted" style={{ fontSize: 13 }}>
                      Total
                    </span>
                    <span className="price-big">
                      {formatMoney(
                        Number(selected.price) * quantity,
                        selected.currency,
                      )}
                    </span>
                  </div>
                </>
              )}
              {session && (
                <>
                  <dl className="kv">
                    <dt>Session</dt>
                    <dd
                      className="mono"
                      title={session.id}
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {session.id.slice(0, 8)}…
                    </dd>
                    <dt>Item</dt>
                    <dd>{session.product_name}</dd>
                    <dt>Quantity</dt>
                    <dd>{session.quantity}</dd>
                    <dt>Status</dt>
                    <dd>
                      <span className="tag">{session.status}</span>
                    </dd>
                  </dl>
                  <hr className="divider" />
                  <div className="spaced" style={{ marginBottom: "1.25rem" }}>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Total
                    </span>
                    <span className="price-big">
                      {formatMoney(
                        Number(session.total_amount),
                        session.currency,
                      )}
                    </span>
                  </div>
                  <button
                    className="btn primary block"
                    onClick={pay}
                    disabled={status === "paying"}
                  >
                    {status === "paying" ? "Processing…" : "Pay Now"}{" "}
                    {status === "paying" ? null : <span className="arrow">→</span>}
                  </button>
                  <button
                    className="btn ghost block"
                    onClick={reset}
                    disabled={status === "paying"}
                    style={{ marginTop: "0.5rem" }}
                  >
                    Cancel
                  </button>
                </>
              )}
              {!selected && (
                <p className="muted">Pick a product to see the summary.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      <div style={{ marginTop: "2.5rem" }}>
        <button className="btn ghost" onClick={() => router.push("/products")}>
          ← Back to catalog
        </button>
      </div>
    </div>
  );
}
