import { useState, type FormEvent, type ReactNode } from "react";
import { Mail, ShieldCheck, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";
import "@/lib/customer-portal-i18n";
import "./customer-login.css";

export function CustomerOtpLogin({ modeSelector, mode, onVerified }: {
  modeSelector?: ReactNode;
  mode: "personal" | "organization";
  onVerified?: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const target = (sentEmail || email).trim().toLowerCase();
    if (!target) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.auth.signInWithOtp({ email: target, options: { shouldCreateUser: true } });
      if (result.error) throw result.error;
      setSentEmail(target); setToken(""); setNotice(t("portal.otpSent"));
    } catch { setError(t("portal.otpSendFailed")); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy || !/^\d{8}$/.test(token) || !sentEmail) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.auth.verifyOtp({ email: sentEmail, token, type: "email" });
      if (result.error || !result.data.session) throw result.error || new Error("session_required");
      setToken(""); onVerified?.();
    } catch { setError(t("portal.otpInvalid")); }
    finally { setBusy(false); }
  }

  return <main className="customer-login-shell">
    <section className="customer-login-wrap" aria-labelledby="customer-login-title">
      <div className="customer-login-branding">
        <img className="customer-login-logo" src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channels Catering" />
        <div className="customer-login-heading">
          <span>{t("portal.title")}</span>
          <h1 id="customer-login-title">{t("portal.welcome")}</h1>
        </div>
      </div>
      {modeSelector}
      <p className="customer-login-description">{t("portal.otpDescription")}</p>
      <form className="customer-login-card" onSubmit={sentEmail ? verify : send}>
        <label><span><Mail />{t("portal.email")}</span>
          <input type="email" required autoComplete="email" value={sentEmail || email} readOnly={Boolean(sentEmail)}
            onChange={e => setEmail(e.target.value)} placeholder={t("portal.emailPlaceholder")} />
        </label>
        {sentEmail && <label><span><ShieldCheck />{t("portal.otpCode")}</span>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{8}" maxLength={8}
            value={token} onChange={e => setToken(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={t("portal.otpPlaceholder")} autoFocus />
        </label>}
        {error && <p className="customer-login-error" role="alert">{error}</p>}
        {notice && <p className="customer-login-notice" role="status">{notice}</p>}
        <Button type="submit" disabled={busy || (sentEmail ? !/^\d{8}$/.test(token) : !email.trim())}>
          {sentEmail ? <ShieldCheck /> : <Send />}{busy ? t("portal.loading") : t(sentEmail ? "portal.otpVerify" : "portal.otpSend")}
        </Button>
        {sentEmail && <div className="customer-login-actions">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void send()}>{t("portal.otpResend")}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSentEmail(""); setToken(""); setError(""); setNotice(""); }}>{t("portal.otpChangeEmail")}</Button>
        </div>}
        <small>{t("portal.otpPrivacy")}</small>
      </form>
    </section>
  </main>;
}
