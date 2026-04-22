"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { checkoutApi, formatDate, formatMoney, type Order } from "@/lib/api";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setOrders(null);
    setError(null);
    checkoutApi
      .listOrders()
      .then(setOrders)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    reload();
  }, []);

  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Orders</span>
          <h1>Orders</h1>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="state error">
          Unable to load orders. <code className="inline-code">{error}</code>
        </div>
      )}

      {!error && orders === null && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}>
                      <div className="skeleton" style={{ height: 14 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders && orders.length === 0 && (
        <div className="state">
          No orders yet. <Link href="/products">Browse products</Link> to get
          started.
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">#{o.id}</td>
                  <td>{o.product_name}</td>
                  <td className="mono">{o.quantity}</td>
                  <td className="mono">
                    {formatMoney(Number(o.total_amount), o.currency)}
                  </td>
                  <td>
                    <span className="tag paid">{o.payment_status}</span>
                  </td>
                  <td>
                    <span className="tag">{o.order_status}</span>
                  </td>
                  <td className="muted">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
