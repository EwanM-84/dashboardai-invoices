"use client";

import { useEffect, useMemo, useState } from "react";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
};

export type Invoice = {
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

export type CompanyProfile = {
  name: string;
  address: string;
  companyNumber: string;
  accountNumber: string;
  sortCode: string;
  logoUrl: string;
};

const DEFAULT_COMPANY: CompanyProfile = {
  name: "DASHBOARD A.I LTD",
  address: "61 Bridge Street, Kington, United Kingdom, HR5 3DJ",
  companyNumber: "17319299",
  accountNumber: "90411675",
  sortCode: "23-01-63",
  logoUrl: "/dashboard-ai-logo-full.png",
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

type InvoiceDashboardProps = {
  company?: CompanyProfile;
  userId?: string;
  plan?: "starter" | "pro" | "owner";
  storedInvoices?: Invoice[];
  onSaveInvoice?: (invoice: Invoice) => Promise<void>;
  onEditCompany?: () => void;
  onManageBilling?: () => void;
  onSignOut?: () => void;
};

export default function InvoiceDashboard({
  company = DEFAULT_COMPANY,
  userId,
  plan = "owner",
  storedInvoices,
  onSaveInvoice,
  onEditCompany,
  onManageBilling,
  onSignOut,
}: InvoiceDashboardProps) {
  const [activeView, setActiveView] = useState<"overview" | "invoices" | "company">(
    "invoices",
  );
  const [invoices, setInvoices] = useState<Invoice[]>(
    () => storedInvoices ?? [],
  );
  const [invoice, setInvoice] = useState<Invoice>(
    () => storedInvoices?.[0] ?? blankInvoice(),
  );
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (storedInvoices) return;
    const stored = window.localStorage.getItem(
      `dashboard-ai-invoices-${userId ?? "local"}`,
    );
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Invoice[];
      queueMicrotask(() => {
        setInvoices(parsed);
        if (parsed[0]) setInvoice(parsed[0]);
      });
    } catch {
      window.localStorage.removeItem("dashboard-ai-invoices");
    }
  }, [storedInvoices, userId]);

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

  const saveInvoice = async (status = invoice.status) => {
    const isNew = !invoices.some((item) => item.id === invoice.id);
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const usedThisMonth = invoices.filter((item) =>
      item.savedAt.startsWith(monthPrefix),
    ).length;
    if (plan === "starter" && isNew && usedThisMonth >= 20) {
      setSavedMessage("20 invoice limit reached — upgrade to Pro");
      window.setTimeout(() => setSavedMessage(""), 3500);
      return;
    }
    const saved = { ...invoice, status, savedAt: new Date().toISOString() };
    const next = [saved, ...invoices.filter((item) => item.id !== saved.id)];
    setInvoice(saved);
    setInvoices(next);
    if (onSaveInvoice) {
      try {
        await onSaveInvoice(saved);
      } catch (error) {
        setSavedMessage(
          error instanceof Error ? error.message : "Could not save invoice",
        );
        return;
      }
    } else {
      window.localStorage.setItem(
        `dashboard-ai-invoices-${userId ?? "local"}`,
        JSON.stringify(next),
      );
    }
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
            <strong>{company.name}</strong>
            <span>Company no. {company.companyNumber || "Not added"}</span>
          </div>
        </div>
        <div className="account-actions">
          <span className="plan-pill">
            {plan === "owner"
              ? "Owner access"
              : plan === "pro"
                ? "Pro · Unlimited"
                : "Starter · 20/month"}
          </span>
          {onManageBilling && (
            <button onClick={onManageBilling}>Manage billing</button>
          )}
          {onSignOut && <button onClick={onSignOut}>Sign out</button>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar no-print">
          <div>
            <span className="eyebrow">{company.name}</span>
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
                src={company.logoUrl || "/dashboard-ai-logo-full.png"}
                alt={`${company.name} logo`}
              />
              <span className="eyebrow">INVOICE SENDER</span>
              <h2>{company.name}</h2>
              <p>{company.address}</p>
              <dl>
                <div>
                  <dt>Company number</dt>
                  <dd>{company.companyNumber || "Not added"}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd>{company.accountNumber || "Not added"}</dd>
                </div>
                <div>
                  <dt>Sort code</dt>
                  <dd>{company.sortCode || "Not added"}</dd>
                </div>
              </dl>
              <p className="helper">
                These details are automatically shown on every invoice.
              </p>
              {onEditCompany && (
                <button className="button primary" onClick={onEditCompany}>
                  Edit company details
                </button>
              )}
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
                      src={company.logoUrl || "/dashboard-ai-logo-full.png"}
                      alt={`${company.name} logo`}
                    />
                    <div>
                      <strong>{company.name}</strong>
                      <p>{company.address}</p>
                      <p>Company no. {company.companyNumber || "Not added"}</p>
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
                  <strong>{company.name}</strong>
                  <div>
                    <p>Sort code <b>{company.sortCode || "Not added"}</b></p>
                    <p>Account number <b>{company.accountNumber || "Not added"}</b></p>
                    <p>Reference <b>{invoice.number}</b></p>
                  </div>
                </div>

                <div className="invoice-notes">
                  <span>NOTES</span>
                  <p>{invoice.notes}</p>
                </div>

                <footer>
                  <span>{company.name}</span>
                  <span>{company.companyNumber}</span>
                  <span>Created with Dashboard A.I</span>
                </footer>
              </article>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
