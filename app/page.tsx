"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import InvoiceDashboard, {
  type CompanyProfile,
  type Invoice,
} from "./components/InvoiceDashboard";
import {
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase/client";

type Profile = {
  id: string;
  email: string | null;
  company_name: string;
  company_address: string;
  company_number: string;
  account_number: string;
  sort_code: string;
  logo_url: string;
  plan: "none" | "starter" | "pro" | "owner";
  subscription_status: string;
  stripe_customer_id: string | null;
  owner_bypass: boolean;
};

const previewCompany: CompanyProfile = {
  name: "DASHBOARD A.I LTD",
  address: "61 Bridge Street, Kington, United Kingdom, HR5 3DJ",
  companyNumber: "17319299",
  accountNumber: "90411675",
  sortCode: "23-01-63",
  logoUrl: "/dashboard-ai-logo-light.png",
};

function profileToCompany(profile: Profile): CompanyProfile {
  return {
    name: profile.company_name,
    address: profile.company_address,
    companyNumber: profile.company_number,
    accountNumber: profile.account_number,
    sortCode: profile.sort_code,
    logoUrl: profile.logo_url,
  };
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [preview, setPreview] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [ownerCode, setOwnerCode] = useState("");
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyDraft, setCompanyDraft] =
    useState<CompanyProfile>(previewCompany);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setInvoices([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) void loadAccount();
  }, [session]); // loadAccount intentionally follows the active session

  async function loadAccount() {
    if (!supabase || !session) return;
    setLoading(true);
    const [profileResult, invoiceResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("data")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
    ]);

    let profileData = profileResult.data as Profile | null;
    let profileError = profileResult.error;

    if (!profileError && !profileData) {
      const repairResult = await supabase
        .from("profiles")
        .insert({
          id: session.user.id,
          email: session.user.email ?? null,
        })
        .select("*")
        .single();
      profileData = repairResult.data as Profile | null;
      profileError = repairResult.error;
    }

    if (profileError || !profileData) {
      setMessage(
        profileError?.message ?? "Your account profile could not be prepared.",
      );
    } else {
      const nextProfile = profileData;
      setProfile(nextProfile);
      setCompanyDraft(profileToCompany(nextProfile));
      if (!nextProfile.company_name) setEditingCompany(true);
    }

    if (!invoiceResult.error) {
      setInvoices(
        (invoiceResult.data ?? []).map((row) => row.data as Invoice),
      );
    }
    setLoading(false);
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setWorking(true);
    setMessage("");

    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
    } else if (authMode === "signup" && !result.data.session) {
      setMessage("Check your email to confirm your account, then sign in.");
      setAuthMode("signin");
    } else {
      setMessage("");
    }
    setWorking(false);
  }

  async function authenticatedPost(path: string, body?: unknown) {
    if (!session) throw new Error("Please sign in again");
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await response.json()) as {
      error?: string;
      url?: string;
      success?: boolean;
    };
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function choosePlan(plan: "starter" | "pro") {
    try {
      setWorking(true);
      setMessage("");
      const { url } = await authenticatedPost("/api/stripe/checkout", { plan });
      if (url) window.location.href = url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setWorking(false);
    }
  }

  async function redeemOwnerCode(event: FormEvent) {
    event.preventDefault();
    try {
      setWorking(true);
      setMessage("");
      await authenticatedPost("/api/owner-access", { code: ownerCode });
      await loadAccount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Code was not accepted");
    } finally {
      setWorking(false);
    }
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session) return;
    setWorking(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        company_name: companyDraft.name.trim(),
        company_address: companyDraft.address.trim(),
        company_number: companyDraft.companyNumber.trim(),
        account_number: companyDraft.accountNumber.trim(),
        sort_code: companyDraft.sortCode.trim(),
        logo_url: companyDraft.logoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) setMessage(error.message);
    else {
      setEditingCompany(false);
      await loadAccount();
    }
    setWorking(false);
  }

  async function uploadLogo(file?: File) {
    if (!file || !supabase || !session) return;
    if (file.size > 2 * 1024 * 1024) {
      setMessage("Logo must be smaller than 2 MB");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${session.user.id}/company-logo.${extension}`;
    setWorking(true);
    const { error } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) setMessage(error.message);
    else {
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      setCompanyDraft((current) => ({
        ...current,
        logoUrl: `${data.publicUrl}?v=${Date.now()}`,
      }));
    }
    setWorking(false);
  }

  async function saveInvoice(invoice: Invoice) {
    if (!supabase || !session) return;
    const total = invoice.items.reduce(
      (sum, item) => sum + item.quantity * item.rate,
      0,
    );
    const totalWithVat = total * (1 + invoice.vatRate / 100);
    const { error } = await supabase.from("invoices").upsert({
      id: invoice.id,
      user_id: session.user.id,
      invoice_number: invoice.number,
      client_name: invoice.client,
      status: invoice.status,
      total: totalWithVat,
      data: invoice,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    setInvoices((current) => [
      invoice,
      ...current.filter((item) => item.id !== invoice.id),
    ]);
  }

  async function manageBilling() {
    try {
      setWorking(true);
      const { url } = await authenticatedPost("/api/stripe/portal");
      if (url) window.location.href = url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing is unavailable");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="saas-loading">
        <img src="/dashboard-ai-logo-light.png" alt="Dashboard AI" />
        <p>Preparing your invoice studio…</p>
      </main>
    );
  }

  if (preview) {
    return (
      <>
        <button className="exit-preview no-print" onClick={() => setPreview(false)}>
          ← Exit preview
        </button>
        <InvoiceDashboard company={previewCompany} plan="owner" />
      </>
    );
  }

  if (!session) {
    return (
      <main className="saas-public">
        <header className="marketing-nav">
          <div className="marketing-brand">
            <img src="/dashboard-ai-logo-light.png" alt="Dashboard AI" />
            <div>
              <strong>Dashboard A.I</strong>
              <span>Invoice Studio</span>
            </div>
          </div>
          <button className="button secondary" onClick={() => setShowAuth(true)}>
            Sign in
          </button>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker">INVOICING, WITHOUT THE FUSS</span>
            <h1>Professional invoices. Paid faster.</h1>
            <p>
              Add your details and logo, create polished invoices in minutes,
              and keep every customer invoice safely in one place.
            </p>
            <div className="hero-actions">
              <button
                className="button primary large"
                onClick={() => {
                  setAuthMode("signup");
                  setShowAuth(true);
                }}
              >
                Start for £5/month
              </button>
              <button
                className="button secondary large"
                onClick={() => setPreview(true)}
              >
                Preview the app
              </button>
            </div>
            <div className="trust-line">
              <span>✓ Secure customer accounts</span>
              <span>✓ Cancel anytime</span>
              <span>✓ Direct PDF downloads</span>
            </div>
          </div>
          <div className="hero-product">
            <div className="mini-window">
              <div className="mini-window-top">
                <i />
                <i />
                <i />
              </div>
              <div className="mini-invoice">
                <div className="mini-logo">D.AI</div>
                <strong>INVOICE</strong>
                <div className="mini-lines">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="mini-total">
                  <span>Total due</span>
                  <b>£900.00</b>
                </div>
              </div>
              <div className="floating-paid">✓ Ready to send</div>
            </div>
          </div>
        </section>

        <section className="pricing-section" id="pricing">
          <span className="hero-kicker">SIMPLE PRICING</span>
          <h2>Choose the plan that fits</h2>
          <p>No setup fees. Upgrade whenever your business grows.</p>
          <div className="pricing-grid">
            <article className="price-card">
              <span>STARTER</span>
              <h3>£5 <small>/ month</small></h3>
              <p>For freelancers and small businesses.</p>
              <ul>
                <li>Up to 20 invoices each month</li>
                <li>Your logo and company details</li>
                <li>Download polished PDF invoices</li>
                <li>Secure invoice history</li>
              </ul>
              <button
                className="button secondary large"
                onClick={() => setShowAuth(true)}
              >
                Choose Starter
              </button>
            </article>
            <article className="price-card featured">
              <div className="popular">MOST POPULAR</div>
              <span>PRO</span>
              <h3>£20 <small>/ month</small></h3>
              <p>For growing businesses that invoice often.</p>
              <ul>
                <li>Unlimited invoices</li>
                <li>Your logo and company details</li>
                <li>Download polished PDF invoices</li>
                <li>Secure invoice history</li>
              </ul>
              <button
                className="button primary large"
                onClick={() => setShowAuth(true)}
              >
                Choose Pro
              </button>
            </article>
          </div>
        </section>

        <footer className="marketing-footer">
          <span>© 2026 DASHBOARD A.I LTD</span>
          <span>Company no. 17319299</span>
        </footer>

        {showAuth && (
          <div className="auth-overlay" role="dialog" aria-modal="true">
            <div className="auth-card">
              <button
                className="auth-close"
                aria-label="Close"
                onClick={() => setShowAuth(false)}
              >
                ×
              </button>
              <img src="/dashboard-ai-logo-light.png" alt="Dashboard AI" />
              <span className="hero-kicker">
                {authMode === "signup" ? "CREATE YOUR ACCOUNT" : "WELCOME BACK"}
              </span>
              <h2>{authMode === "signup" ? "Start invoicing" : "Sign in"}</h2>
              <p>
                {authMode === "signup"
                  ? "Create your secure account, then choose a plan."
                  : "Enter your details to open your dashboard."}
              </p>
              {!isSupabaseConfigured && (
                <div className="setup-notice">
                  Customer accounts are waiting for the new Supabase project to
                  be connected.
                </div>
              )}
              <form onSubmit={handleAuth}>
                <label>
                  Email address
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.co.uk"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={
                      authMode === "signup" ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </label>
                {message && <p className="form-message">{message}</p>}
                <button
                  className="button primary large"
                  disabled={working || !isSupabaseConfigured}
                >
                  {working
                    ? "Please wait…"
                    : authMode === "signup"
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>
              <button
                className="auth-switch"
                onClick={() =>
                  setAuthMode((current) =>
                    current === "signup" ? "signin" : "signup",
                  )
                }
              >
                {authMode === "signup"
                  ? "Already have an account? Sign in"
                  : "Need an account? Sign up"}
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="saas-loading">
        <p>{message || "Loading your account…"}</p>
        <button className="button secondary" onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </main>
    );
  }

  const hasAccess =
    profile.owner_bypass ||
    ((profile.plan === "starter" || profile.plan === "pro") &&
      ["active", "trialing"].includes(profile.subscription_status));

  if (!hasAccess) {
    return (
      <main className="onboarding-shell">
        <div className="onboarding-brand">
          <img src="/dashboard-ai-logo-light.png" alt="Dashboard AI" />
          <strong>Choose your plan</strong>
          <button onClick={() => supabase?.auth.signOut()}>Sign out</button>
        </div>
        <div className="onboarding-content">
          <span className="hero-kicker">STEP 2 OF 3</span>
          <h1>Choose how many invoices you need</h1>
          <p>Your secure account is ready. Select a monthly plan to continue.</p>
          <div className="pricing-grid compact">
            <article className="price-card">
              <span>STARTER</span>
              <h3>£5 <small>/ month</small></h3>
              <ul>
                <li>Up to 20 invoices monthly</li>
                <li>Logo and company details</li>
                <li>PDF-ready invoices</li>
              </ul>
              <button
                className="button secondary large"
                disabled={working}
                onClick={() => choosePlan("starter")}
              >
                Choose £5 plan
              </button>
            </article>
            <article className="price-card featured">
              <div className="popular">BEST FOR GROWTH</div>
              <span>PRO</span>
              <h3>£20 <small>/ month</small></h3>
              <ul>
                <li>Unlimited invoices</li>
                <li>Logo and company details</li>
                <li>PDF-ready invoices</li>
              </ul>
              <button
                className="button primary large"
                disabled={working}
                onClick={() => choosePlan("pro")}
              >
                Choose £20 plan
              </button>
            </article>
          </div>
          <form className="owner-code" onSubmit={redeemOwnerCode}>
            <label>
              Owner access code
              <input
                type="password"
                inputMode="numeric"
                value={ownerCode}
                onChange={(event) => setOwnerCode(event.target.value)}
                placeholder="Enter code"
              />
            </label>
            <button className="button secondary" disabled={working}>
              Apply code
            </button>
          </form>
          {message && <p className="form-message">{message}</p>}
        </div>
      </main>
    );
  }

  if (editingCompany || !profile.company_name) {
    return (
      <main className="onboarding-shell">
        <div className="onboarding-brand">
          <img src="/dashboard-ai-logo-light.png" alt="Dashboard AI" />
          <strong>Your company details</strong>
          {profile.company_name && (
            <button onClick={() => setEditingCompany(false)}>Back to invoices</button>
          )}
        </div>
        <div className="company-setup">
          <span className="hero-kicker">
            {profile.company_name ? "COMPANY SETTINGS" : "STEP 3 OF 3"}
          </span>
          <h1>Make every invoice yours</h1>
          <p>Add the details customers should see on your invoices.</p>
          <form onSubmit={saveCompany}>
            <div className="logo-uploader">
              <img
                src={companyDraft.logoUrl || "/dashboard-ai-logo-light.png"}
                alt="Company logo preview"
              />
              <label className="button secondary">
                Upload logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => uploadLogo(event.target.files?.[0])}
                />
              </label>
              <small>PNG, JPG or WebP. Maximum 2 MB.</small>
            </div>
            <div className="company-form-grid">
              <label>
                Company name
                <input
                  required
                  value={companyDraft.name}
                  onChange={(event) =>
                    setCompanyDraft({ ...companyDraft, name: event.target.value })
                  }
                />
              </label>
              <label>
                Company number
                <input
                  value={companyDraft.companyNumber}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      companyNumber: event.target.value,
                    })
                  }
                />
              </label>
              <label className="full">
                Business address
                <textarea
                  required
                  rows={3}
                  value={companyDraft.address}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      address: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Bank account number
                <input
                  value={companyDraft.accountNumber}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      accountNumber: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Sort code
                <input
                  value={companyDraft.sortCode}
                  onChange={(event) =>
                    setCompanyDraft({
                      ...companyDraft,
                      sortCode: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            {message && <p className="form-message">{message}</p>}
            <button className="button primary large" disabled={working}>
              {working ? "Saving…" : "Save and open dashboard"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <InvoiceDashboard
      company={profileToCompany(profile)}
      userId={session.user.id}
      plan={
        profile.plan === "pro"
          ? "pro"
          : profile.plan === "starter"
            ? "starter"
            : "owner"
      }
      storedInvoices={invoices}
      onSaveInvoice={saveInvoice}
      onEditCompany={() => setEditingCompany(true)}
      onManageBilling={manageBilling}
      onSignOut={() => supabase?.auth.signOut()}
    />
  );
}
