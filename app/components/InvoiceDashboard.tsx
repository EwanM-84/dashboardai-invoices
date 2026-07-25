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
  logoUrl: "/dashboard-ai-logo-mark.png",
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

const pdfMoney = (value: number) =>
  `£${Number(value || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const safeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "invoice";

async function loadPdfImage(url: string) {
  if (!url) return null;
  try {
    const response = await fetch(new URL(url, window.location.href));
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const format = blob.type.includes("jpeg")
      ? "JPEG"
      : blob.type.includes("webp")
        ? "WEBP"
        : "PNG";
    return { dataUrl, format };
  } catch {
    return null;
  }
}

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
  const [isExporting, setIsExporting] = useState(false);

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

  const downloadPdf = async () => {
    setIsExporting(true);
    setSavedMessage("Preparing your PDF…");

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const navy: [number, number, number] = [11, 20, 40];
      const blue: [number, number, number] = [49, 87, 231];
      const slate: [number, number, number] = [82, 96, 117];
      const pale: [number, number, number] = [242, 245, 251];
      const line: [number, number, number] = [224, 229, 239];
      let y = 18;

      const addPageHeader = (continuation = false) => {
        doc.setFillColor(...navy);
        doc.rect(0, 0, pageWidth, 5, "F");
        doc.setTextColor(...navy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(company.name, margin, 17);
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(
          continuation ? `${invoice.number} · Continued` : "Professional invoice",
          pageWidth - margin,
          17,
          { align: "right" },
        );
      };

      addPageHeader();

      const logo = await loadPdfImage(
        company.logoUrl || "/dashboard-ai-logo-mark.png",
      );
      if (logo) {
        try {
          doc.addImage(logo.dataUrl, logo.format, margin, 23, 18, 18);
        } catch {
          // The company name remains as a reliable fallback if an uploaded
          // image format cannot be embedded by the browser PDF engine.
        }
      }

      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(25);
      doc.text("INVOICE", pageWidth - margin, 32, { align: "right" });
      doc.setTextColor(...blue);
      doc.setFontSize(10);
      doc.text(invoice.number, pageWidth - margin, 40, { align: "right" });

      doc.setTextColor(...slate);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const companyAddress = doc.splitTextToSize(company.address, 82);
      doc.text(companyAddress, margin, 45);
      doc.text(
        `Company number: ${company.companyNumber || "Not added"}`,
        margin,
        45 + companyAddress.length * 4,
      );

      y = 66;
      doc.setFillColor(...pale);
      doc.roundedRect(margin, y, contentWidth, 36, 2.5, 2.5, "F");
      doc.setTextColor(...blue);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("BILL TO", margin + 6, y + 8);
      doc.setTextColor(...navy);
      doc.setFontSize(11);
      doc.text(invoice.client || "Client name", margin + 6, y + 16);
      doc.setTextColor(...slate);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const clientLines = doc.splitTextToSize(
        [invoice.address, invoice.email].filter(Boolean).join(" · ") ||
          "Client billing details",
        92,
      );
      doc.text(clientLines.slice(0, 3), margin + 6, y + 22);

      const datesX = pageWidth - margin - 55;
      doc.setTextColor(...slate);
      doc.setFontSize(7);
      doc.text("ISSUE DATE", datesX, y + 9);
      doc.text("DUE DATE", datesX, y + 23);
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(invoice.issueDate, pageWidth - margin - 6, y + 9, {
        align: "right",
      });
      doc.text(invoice.dueDate, pageWidth - margin - 6, y + 23, {
        align: "right",
      });

      const drawTableHeader = (top: number) => {
        doc.setFillColor(...navy);
        doc.roundedRect(margin, top, contentWidth, 10, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text("DESCRIPTION", margin + 4, top + 6.5);
        doc.text("QTY", 131, top + 6.5, { align: "right" });
        doc.text("RATE", 158, top + 6.5, { align: "right" });
        doc.text("AMOUNT", pageWidth - margin - 4, top + 6.5, {
          align: "right",
        });
      };

      y = 111;
      drawTableHeader(y);
      y += 10;

      invoice.items.forEach((item) => {
        const description = doc.splitTextToSize(
          item.description || "Invoice item",
          92,
        );
        const rowHeight = Math.max(12, description.length * 4 + 5);

        if (y + rowHeight > pageHeight - 58) {
          doc.addPage();
          addPageHeader(true);
          y = 26;
          drawTableHeader(y);
          y += 10;
        }

        doc.setTextColor(...navy);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(description, margin + 4, y + 7);
        doc.text(String(item.quantity), 131, y + 7, { align: "right" });
        doc.text(pdfMoney(item.rate), 158, y + 7, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.text(
          pdfMoney(item.quantity * item.rate),
          pageWidth - margin - 4,
          y + 7,
          { align: "right" },
        );
        doc.setDrawColor(...line);
        doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
        y += rowHeight;
      });

      if (y > pageHeight - 92) {
        doc.addPage();
        addPageHeader(true);
        y = 28;
      }

      const totalsX = 122;
      y += 9;
      doc.setTextColor(...slate);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Subtotal", totalsX, y);
      doc.text(pdfMoney(totals.subtotal), pageWidth - margin, y, {
        align: "right",
      });
      y += 8;
      doc.text(`VAT (${invoice.vatRate}%)`, totalsX, y);
      doc.text(pdfMoney(totals.vat), pageWidth - margin, y, {
        align: "right",
      });
      y += 6;
      doc.setDrawColor(...line);
      doc.line(totalsX, y, pageWidth - margin, y);
      y += 9;
      doc.setTextColor(...navy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Total due", totalsX, y);
      doc.text(pdfMoney(totals.total), pageWidth - margin, y, {
        align: "right",
      });

      y += 14;
      doc.setFillColor(...navy);
      doc.roundedRect(margin, y, contentWidth, 29, 2.5, 2.5, "F");
      doc.setTextColor(146, 178, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("PAYMENT DETAILS", margin + 6, y + 8);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(
        `Account name  ${company.name}`,
        margin + 6,
        y + 17,
      );
      doc.text(
        `Sort code  ${company.sortCode || "Not added"}`,
        margin + 6,
        y + 24,
      );
      doc.text(
        `Account number  ${company.accountNumber || "Not added"}`,
        95,
        y + 17,
      );
      doc.text(`Reference  ${invoice.number}`, 95, y + 24);

      if (invoice.notes) {
        y += 39;
        doc.setTextColor(...blue);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text("NOTES & PAYMENT TERMS", margin, y);
        doc.setTextColor(...slate);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(doc.splitTextToSize(invoice.notes, contentWidth), margin, y + 7);
      }

      doc.setDrawColor(...line);
      doc.line(margin, pageHeight - 17, pageWidth - margin, pageHeight - 17);
      doc.setTextColor(...slate);
      doc.setFontSize(7);
      doc.text(company.name, margin, pageHeight - 11);
      doc.text("Created with Dashboard A.I", pageWidth - margin, pageHeight - 11, {
        align: "right",
      });

      const clientPart = invoice.client ? `-${safeFileName(invoice.client)}` : "";
      doc.save(`${safeFileName(invoice.number)}${clientPart}.pdf`);
      setSavedMessage("PDF downloaded");
    } catch (error) {
      setSavedMessage(
        error instanceof Error ? error.message : "Could not create PDF",
      );
    } finally {
      setIsExporting(false);
      window.setTimeout(() => setSavedMessage(""), 3200);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand">
          <img
            className="brand-logo"
            src="/dashboard-ai-logo-mark.png"
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
            <span>01</span> Overview
          </button>
          <button
            className={activeView === "invoices" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("invoices")}
          >
            <span>02</span> Invoices
          </button>
          <button
            className={activeView === "company" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("company")}
          >
            <span>03</span> Company
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
          <div className="page-heading">
            <span className="eyebrow">
              {activeView === "invoices" ? "INVOICE WORKSPACE" : company.name}
            </span>
            <h1>
              {activeView === "overview"
                ? "Business overview"
                : activeView === "company"
                  ? "Company details"
                  : "Create a polished invoice"}
            </h1>
            <p>
              {activeView === "overview"
                ? "Track drafts, outstanding invoices and paid revenue."
                : activeView === "company"
                  ? "The details displayed on every customer invoice."
                  : "Build, save and download an A4-ready customer invoice."}
            </p>
          </div>
          <div className="top-actions">
            {savedMessage && <span className="saved-message">{savedMessage}</span>}
            {activeView === "overview" && (
              <button className="button primary" onClick={createInvoice}>
                New invoice
              </button>
            )}
            {activeView === "invoices" && (
              <>
                <span className={`status ${invoice.status.toLowerCase()}`}>
                  {invoice.status}
                </span>
                <button
                  className="button secondary"
                  onClick={() => saveInvoice("Draft")}
                >
                  Save draft
                </button>
                <button
                  className="button primary"
                  onClick={downloadPdf}
                  disabled={isExporting}
                >
                  {isExporting ? "Creating PDF…" : "Download PDF"}
                </button>
              </>
            )}
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
                src={company.logoUrl || "/dashboard-ai-logo-mark.png"}
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
                <button
                  className="button primary"
                  onClick={downloadPdf}
                  disabled={isExporting}
                >
                  {isExporting ? "Creating PDF…" : "Download PDF"}
                </button>
              </div>
            </section>

            <aside className="preview-wrap">
              <div className="preview-heading no-print">
                <span className="preview-label">A4 LIVE PREVIEW</span>
                <span>Updates as you type</span>
              </div>
              <article className="invoice-paper">
                <div className="paper-top">
                  <div className="invoice-brand">
                    <img
                      className="paper-logo"
                      src={company.logoUrl || "/dashboard-ai-logo-mark.png"}
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
