"use client";

import { useEffect, useMemo, useState } from "react";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
};

type Invoice = {
  id: string;
  number: string;
  client: string;
  email: string;
  address: string;
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  vatRate: number;
  notes: string;
  status: "Draft" | "Sent" | "Paid";
  savedAt: string;
};

const COMPANY = {
  name: "DASHBOARD A.I LTD",
  address: "61 Bridge Street, Kington, United Kingdom, HR5 3DJ",
  number: "17319299",
  account: "90411675",
  sortCode: "23-01-63",
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};
const money = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);

const blankInvoice = (number = "INV-0001"): Invoice => ({
  id: `invoice-${Date.now()}`,
  number,
  client: "",
  email: "",
  address: "",
  issueDate: today(),
  dueDate: addDays(today(), 14),
  items: [
    {
      id: `item-${Date.now()}`,
      description: "AI consulting services",
      quantity: 1,
      rate: 750,
    },
  ],
  vatRate: 20,
  notes: "Thank you for your business. Payment is due within 14 days.",
  status: "Draft",
  savedAt: new Date().toISOString(),
});

function calculate(invoice: Invoice) {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0,
  );
  const vat = subtotal * (Number(invoice.vatRate || 0) / 100);
  return { subtotal, vat, total: subtotal + vat };
}

export default function Home() {
  const [activeView, setActiveView] = useState<"overview" | "invoices" | "company">(
    "invoices",
  );
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoice, setInvoice] = useState<Invoice>(() => blankInvoice());
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("dashboard-ai-invoices");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Invoice[];
      setInvoices(parsed);
      if (parsed[0]) setInvoice(parsed[0]);
    } catch {
      window.localStorage.removeItem("dashboard-ai-invoices");
    }
  }, []);

  const totals = useMemo(() => calculate(invoice), [invoice]);
  const paidTotal = invoices
    .filter((item) => item.status === "Paid")
    .reduce((sum, item) => sum + calculate(item).total, 0);
  const outstandingTotal = invoices
    .filter((item) => item.status === "Sent")
    .reduce((sum, item) => sum + calculate(item).total, 0);

  const update = <K extends keyof Invoice>(key: K, value: Invoice[K]) => {
    setInvoice((current) => ({ ...current, [key]: value }));
  };

  const updateItem = (
    id: string,
    key: keyof Omit<LineItem, "id">,
    value: string | number,
  ) => {
    update(
      "items",
      invoice.items.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    );
  };

  const saveInvoice = (status = invoice.status) => {
    const saved = { ...invoice, status, savedAt: new Date().toISOString() };
    const next = [saved, ...invoices.filter((item) => item.id !== saved.id)];
    setInvoice(saved);
    setInvoices(next);
    window.localStorage.setItem("dashboard-ai-invoices", JSON.stringify(next));
    setSavedMessage(status === "Draft" ? "Draft saved" : `Marked as ${status}`);
    window.setTimeout(() => setSavedMessage(""), 2200);
  };

  const createInvoice = () => {
    const highest = invoices.reduce((max, item) => {
      const value = Number(item.number.replace(/\D/g, ""));
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
    setInvoice(blankInvoice(`INV-${String(highest + 1).padStart(4, "0")}`));
    setActiveView("invoices");
  };

  const addItem = () => {
    update("items", [
      ...invoice.items,
      {
        id: `item-${Date.now()}`,
        description: "",
        quantity: 1,
        rate: 0,
      },
    ]);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <img
            className="brand-logo"
            src="/dashboard-ai-logo-full.png"
            alt="Dashboard AI logo"
          />
          <div>
            <strong>Dashboard A.I</strong>
            <span>Invoice studio</span>
          </div>
        </div>

        <nav aria-label="Main navigation">
          <button
            className={activeView === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("overview")}
          >
            <span>⌂</span> Overview
          </button>
          <button
            className={activeView === "invoices" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("invoices")}
          >
            <span>▤</span> Invoices
          </button>
          <button
            className={activeView === "company" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("company")}
          >
            <span>□</span> Company
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">DA</div>
          <div>
            <strong>DASHBOARD A.I LTD</strong>
            <span>Company no. {COMPANY.number}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar no-print">
          <div>
            <span className="eyebrow">DASHBOARD A.I LTD</span>
            <h1>
              {activeView === "overview"
                ? "Good afternoon"
                : activeView === "company"
                  ? "Company details"
                  : "Create invoice"}
            </h1>
          </div>
          <div className="top-actions">
            {savedMessage && <span className="saved-message">✓ {savedMessage}</span>}
            <button className="button secondary" onClick={() => saveInvoice("Draft")}>
              Save draft
            </button>
            <button className="button primary" onClick={() => window.print()}>
              Print / PDF
            </button>
          </div>
        </header>

        {activeView === "overview" && (
          <div className="overview no-print">
            <div className="summary-grid">
              <article className="summary-card dark-card">
                <span>Paid this year</span>
                <strong>{money(paidTotal)}</strong>
                <small>{invoices.filter((item) => item.status === "Paid").length} invoices</small>
              </article>
              <article className="summary-card">
                <span>Outstanding</span>
                <strong>{money(outstandingTotal)}</strong>
                <small>{invoices.filter((item) => item.status === "Sent").length} awaiting payment</small>
              </article>
              <article className="summary-card">
                <span>Draft invoices</span>
                <strong>{invoices.filter((item) => item.status === "Draft").length}</strong>
                <small>Saved on this device</small>
              </article>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">RECENT ACTIVITY</span>
                  <h2>Your invoices</h2>
                </div>
                <button className="button primary" onClick={createInvoice}>
                  + New invoice
                </button>
              </div>
              {invoices.length === 0 ? (
                <div className="empty-state">
                  <div>▤</div>
                  <h3>No saved invoices yet</h3>
                  <p>Create your first invoice and it will appear here.</p>
                  <button className="button secondary" onClick={createInvoice}>
                    Create invoice
                  </button>
                </div>
              ) : (
                <div className="invoice-list">
                  {invoices.map((item) => (
                    <button
                      key={item.id}
                      className="invoice-row"
                      onClick={() => {
                        setInvoice(item);
                        setActiveView("invoices");
                      }}
                    >
                      <span>
                        <strong>{item.client || "Untitled client"}</strong>
                        <small>{item.number}</small>
                      </span>
                      <span className={`status ${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                      <strong>{money(calculate(item).total)}</strong>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeView === "company" && (
          <div className="company-view no-print">
            <section className="panel company-panel">
              <img
                className="company-logo"
                src="/dashboard-ai-logo-full.png"
                alt="Dashboard AI logo"
              />
              <span className="eyebrow">INVOICE SENDER</span>
              <h2>{COMPANY.name}</h2>
              <p>{COMPANY.address}</p>
              <dl>
                <div>
                  <dt>Company number</dt>
                  <dd>{COMPANY.number}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd>{COMPANY.account}</dd>
                </div>
                <div>
                  <dt>Sort code</dt>
                  <dd>{COMPANY.sortCode}</dd>
                </div>
              </dl>
              <p className="helper">
                These details are automatically shown on every invoice.
              </p>
            </section>
          </div>
        )}

        {activeView === "invoices" && (
          <div className="invoice-workspace">
            <section className="editor no-print">
              <div className="editor-section">
                <div className="section-heading">
                  <span>01</span>
                  <div>
                    <h2>Invoice details</h2>
                    <p>Set the invoice number and payment dates.</p>
                  </div>
                </div>
                <div className="form-grid three">
                  <label>
                    Invoice number
                    <input
                      value={invoice.number}
                      onChange={(event) => update("number", event.target.value)}
                    />
                  </label>
                  <label>
                    Issue date
                    <input
                      type="date"
                      value={invoice.issueDate}
                      onChange={(event) => update("issueDate", event.target.value)}
                    />
                  </label>
                  <label>
                    Due date
                    <input
                      type="date"
                      value={invoice.dueDate}
                      onChange={(event) => update("dueDate", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="editor-section">
                <div className="section-heading">
                  <span>02</span>
                  <div>
                    <h2>Bill to</h2>
                    <p>Add your customer’s contact details.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Client or company name
                    <input
                      placeholder="e.g. Northstar Studio Ltd"
                      value={invoice.client}
                      onChange={(event) => update("client", event.target.value)}
                    />
                  </label>
                  <label>
                    Email address
                    <input
                      type="email"
                      placeholder="accounts@client.co.uk"
                      value={invoice.email}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </label>
                  <label className="full">
                    Billing address
                    <textarea
                      rows={2}
                      placeholder="Client billing address"
                      value={invoice.address}
                      onChange={(event) => update("address", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="editor-section">
                <div className="section-heading">
                  <span>03</span>
                  <div>
                    <h2>Items</h2>
                    <p>Add the work, products, or services supplied.</p>
                  </div>
                </div>
                <div className="items-editor">
                  <div className="item-labels">
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span>Total</span>
                    <span />
                  </div>
                  {invoice.items.map((item) => (
                    <div className="item-row" key={item.id}>
                      <input
                        aria-label="Item description"
                        placeholder="Description of work"
                        value={item.description}
                        onChange={(event) =>
                          updateItem(item.id, "description", event.target.value)
                        }
                      />
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.id, "quantity", Number(event.target.value))
                        }
                      />
                      <input
                        aria-label="Rate"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(event) =>
                          updateItem(item.id, "rate", Number(event.target.value))
                        }
                      />
                      <strong>{money(item.quantity * item.rate)}</strong>
                      <button
                        aria-label="Remove item"
                        className="remove-item"
                        onClick={() =>
                          update(
                            "items",
                            invoice.items.filter((line) => line.id !== item.id),
                          )
                        }
                        disabled={invoice.items.length === 1}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button className="add-item" onClick={addItem}>
                    + Add another item
                  </button>
                </div>
              </div>

              <div className="editor-section totals-editor">
                <label>
                  VAT rate
                  <select
                    value={invoice.vatRate}
                    onChange={(event) => update("vatRate", Number(event.target.value))}
                  >
                    <option value={0}>No VAT (0%)</option>
                    <option value={5}>Reduced rate (5%)</option>
                    <option value={20}>Standard rate (20%)</option>
                  </select>
                </label>
                <div className="totals-box">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(totals.subtotal)}</strong>
                  </div>
                  <div>
                    <span>VAT ({invoice.vatRate}%)</span>
                    <strong>{money(totals.vat)}</strong>
                  </div>
                  <div className="grand-total">
                    <span>Total due</span>
                    <strong>{money(totals.total)}</strong>
                  </div>
                </div>
              </div>

              <div className="editor-section">
                <label>
                  Notes and payment terms
                  <textarea
                    rows={3}
                    value={invoice.notes}
                    onChange={(event) => update("notes", event.target.value)}
                  />
                </label>
              </div>

              <div className="editor-actions">
                <button className="button secondary" onClick={() => saveInvoice("Draft")}>
                  Save as draft
                </button>
                <button className="button secondary" onClick={() => saveInvoice("Sent")}>
                  Mark as sent
                </button>
                <button className="button primary" onClick={() => window.print()}>
                  Print / Save PDF
                </button>
              </div>
            </section>

            <aside className="preview-wrap">
              <span className="preview-label no-print">LIVE PREVIEW</span>
              <article className="invoice-paper">
                <div className="paper-top">
                  <div className="invoice-brand">
                    <img
                      className="paper-logo"
                      src="/dashboard-ai-logo-full.png"
                      alt="Dashboard AI logo"
                    />
                    <div>
                      <strong>{COMPANY.name}</strong>
                      <p>{COMPANY.address}</p>
                      <p>Company no. {COMPANY.number}</p>
                    </div>
                  </div>
                  <div className="invoice-title">
                    <span>INVOICE</span>
                    <strong>{invoice.number}</strong>
                  </div>
                </div>

                <div className="invoice-meta">
                  <div>
                    <span>BILL TO</span>
                    <strong>{invoice.client || "Client name"}</strong>
                    {invoice.address ? (
                      <p className="preline">{invoice.address}</p>
                    ) : (
                      <p>Client billing address</p>
                    )}
                    {invoice.email && <p>{invoice.email}</p>}
                  </div>
                  <dl>
                    <div>
                      <dt>Issue date</dt>
                      <dd>{invoice.issueDate}</dd>
                    </div>
                    <div>
                      <dt>Due date</dt>
                      <dd>{invoice.dueDate}</dd>
                    </div>
                  </dl>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description || "Invoice item"}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.rate)}</td>
                        <td>{money(item.quantity * item.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="paper-totals">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(totals.subtotal)}</strong>
                  </div>
                  <div>
                    <span>VAT ({invoice.vatRate}%)</span>
                    <strong>{money(totals.vat)}</strong>
                  </div>
                  <div>
                    <span>Total due</span>
                    <strong>{money(totals.total)}</strong>
                  </div>
                </div>

                <div className="payment-card">
                  <span>PAYMENT DETAILS</span>
                  <strong>{COMPANY.name}</strong>
                  <div>
                    <p>Sort code <b>{COMPANY.sortCode}</b></p>
                    <p>Account number <b>{COMPANY.account}</b></p>
                    <p>Reference <b>{invoice.number}</b></p>
                  </div>
                </div>

                <div className="invoice-notes">
                  <span>NOTES</span>
                  <p>{invoice.notes}</p>
                </div>

                <footer>
                  <span>{COMPANY.name}</span>
                  <span>{COMPANY.number}</span>
                  <span>dashboard-ai.co.uk</span>
                </footer>
              </article>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
