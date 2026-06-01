"use client";

import { formatDate, formatMoney, type CheckoutSession, type Order } from "@/lib/api";

interface CheckoutCardProps {
  session: CheckoutSession;
  onConfirm: (sessionId: string) => void;
  pending?: boolean;
}

/**
 * Inline checkout-confirmation card rendered after a create_checkout_session
 * tool result. Shows product, quantity, unit price and total, and exposes a
 * "Confirm Purchase" button that triggers the process_payment tool call.
 */
export function CheckoutCard({ session, onConfirm, pending = false }: CheckoutCardProps) {
  return (
    <div
      className="chat-card checkout-card"
      data-testid="checkout-card"
      data-card-kind="checkout"
      data-session-id={session.id}
    >
      <div className="chat-card-header">
        <span className="chat-card-badge">Checkout</span>
        <span className="chat-card-title">{session.product_name}</span>
      </div>
      <dl className="chat-card-rows">
        <div className="chat-card-row">
          <dt>Quantity</dt>
          <dd data-testid="checkout-quantity">{session.quantity}</dd>
        </div>
        <div className="chat-card-row">
          <dt>Unit price</dt>
          <dd data-testid="checkout-unit-price">
            {formatMoney(session.unit_price, session.currency)}
          </dd>
        </div>
        <div className="chat-card-row total">
          <dt>Total</dt>
          <dd data-testid="checkout-total">
            {formatMoney(session.total_amount, session.currency)}
          </dd>
        </div>
        <div className="chat-card-row">
          <dt>Currency</dt>
          <dd data-testid="checkout-currency">{session.currency}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="btn primary chat-card-confirm"
        data-testid="confirm-purchase-button"
        disabled={pending}
        onClick={() => onConfirm(session.id)}
      >
        {pending ? "Processing…" : "Confirm Purchase"}
      </button>
    </div>
  );
}

interface OrderConfirmationCardProps {
  order: Order;
}

/**
 * Order-confirmation card rendered after a successful process_payment tool
 * result. Shows the order id and the order timestamp.
 */
export function OrderConfirmationCard({ order }: OrderConfirmationCardProps) {
  return (
    <div
      className="chat-card order-card"
      data-testid="order-card"
      data-card-kind="order"
      data-order-id={order.id}
    >
      <div className="chat-card-header">
        <span className="chat-card-badge success">Order confirmed</span>
        <span className="chat-card-title">{order.product_name}</span>
      </div>
      <dl className="chat-card-rows">
        <div className="chat-card-row">
          <dt>Order ID</dt>
          <dd data-testid="order-id">#{order.id}</dd>
        </div>
        <div className="chat-card-row">
          <dt>Quantity</dt>
          <dd>{order.quantity}</dd>
        </div>
        <div className="chat-card-row total">
          <dt>Total</dt>
          <dd>{formatMoney(order.total_amount, order.currency)}</dd>
        </div>
        <div className="chat-card-row">
          <dt>Placed</dt>
          <dd data-testid="order-timestamp">{formatDate(order.created_at)}</dd>
        </div>
      </dl>
    </div>
  );
}

interface PaymentErrorCardProps {
  reason: string;
}

/**
 * Error card rendered when a checkout/payment tool result is an `Error: ...`
 * string (e.g. out of stock). Surfaces the failure reason to the shopper.
 */
export function PaymentErrorCard({ reason }: PaymentErrorCardProps) {
  return (
    <div
      className="chat-card error-card"
      data-testid="payment-error-card"
      data-card-kind="error"
      role="alert"
    >
      <div className="chat-card-header">
        <span className="chat-card-badge error">Payment failed</span>
      </div>
      <p className="chat-card-error-reason" data-testid="payment-error-reason">
        {reason}
      </p>
    </div>
  );
}
