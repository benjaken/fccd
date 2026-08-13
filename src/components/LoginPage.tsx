import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Languages,
  LockKeyhole,
  Moon,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  getQuickLoginCredentials,
  shouldAutologinFromUrl,
  stripAutologinParam,
} from "@/lib/quick-login";
import { useTheme } from "@/lib/use-theme";

type View = "sign-in" | "reset";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { signIn, resetPassword, configured } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const quickLogin = getQuickLoginCredentials();
  const [view, setView] = useState<View>("sign-in");
  const [email, setEmail] = useState(quickLogin?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    configured ? null : t("auth.configuration"),
  );
  const [resetSent, setResetSent] = useState(false);
  const autologinStarted = useRef(false);

  const switchLanguage = () => {
    void i18n.changeLanguage(i18n.language === "en" ? "zh-HK" : "en");
  };

  const validateEmail = () => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!valid) setError(t("auth.emailRequired"));
    return valid;
  };

  const completeSignIn = async (nextEmail: string, nextPassword: string) => {
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail.trim())) {
      setError(t("auth.emailRequired"));
      return;
    }
    if (!nextPassword) {
      setError(t("auth.passwordRequired"));
      return;
    }

    setSubmitting(true);
    const result = await signIn(nextEmail.trim(), nextPassword);
    setSubmitting(false);

    if (!result) return;
    setError(
      result === "configuration"
        ? t("auth.configuration")
        : result === "invalid_credentials"
          ? t("auth.invalidCredentials")
          : t("auth.genericError"),
    );
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await completeSignIn(email, password);
  };

  const handleQuickLogin = async () => {
    if (!quickLogin || !configured || submitting) return;
    setView("sign-in");
    setEmail(quickLogin.email);
    setPassword(quickLogin.password);
    await completeSignIn(quickLogin.email, quickLogin.password);
  };

  useEffect(() => {
    if (
      !quickLogin ||
      !configured ||
      autologinStarted.current ||
      !shouldAutologinFromUrl()
    ) {
      return;
    }

    autologinStarted.current = true;
    window.history.replaceState({}, "", stripAutologinParam());
    void handleQuickLogin();
    // Run once on mount for ?autologin=1 preview links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, quickLogin?.email]);

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResetSent(false);

    if (!validateEmail()) return;

    setSubmitting(true);
    const result = await resetPassword(email.trim());
    setSubmitting(false);

    if (!result) {
      setResetSent(true);
      return;
    }

    setError(
      result === "configuration"
        ? t("auth.configuration")
        : t("auth.genericError"),
    );
  };

  const openReset = () => {
    setView("reset");
    setError(null);
    setResetSent(false);
  };

  const openSignIn = () => {
    setView("sign-in");
    setError(null);
    setResetSent(false);
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-glow login-brand-glow-one" />
        <div className="login-brand-glow login-brand-glow-two" />
        <div className="login-brand-content">
          <a
            className="login-brand"
            href="/"
            aria-label="Food Channel Catering"
          >
            <span className="login-brand-mark">FC</span>
            <span>
              <strong>Food Channel Catering</strong>
              <small>Operations</small>
            </span>
          </a>

          <div className="login-message">
            <span className="login-kicker">
              <ShieldCheck />
              {t("auth.secureAccess")}
            </span>
            <h1>{t("auth.operations")}</h1>
            <p>{t("auth.operationsDescription")}</p>
          </div>

          <div className="login-proof">
            <span>
              <CheckCircle2 />
              Catering
            </span>
            <span>
              <CheckCircle2 />
              Central Kitchen
            </span>
            <span>
              <CheckCircle2 />
              Delivery
            </span>
          </div>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-toolbar">
          <Button
            variant="ghost"
            size="icon"
            onClick={switchLanguage}
            aria-label={t("common.switchLanguage")}
          >
            <Languages />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={t("common.switchTheme")}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>

        <div className="login-card">
          <span className="eyebrow">{t("auth.eyebrow")}</span>
          <h2>{view === "sign-in" ? t("auth.title") : t("auth.resetTitle")}</h2>
          <p>
            {view === "sign-in"
              ? t("auth.description")
              : t("auth.resetDescription")}
          </p>

          <form
            className="login-form"
            onSubmit={view === "sign-in" ? handleSignIn : handleReset}
            noValidate
          >
            <label className="form-field">
              <span>{t("auth.email")}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
                inputMode="email"
                disabled={submitting}
                autoFocus
              />
            </label>

            {view === "sign-in" && (
              <label className="form-field">
                <span>{t("auth.password")}</span>
                <span className="password-input">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    autoComplete="current-password"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </span>
              </label>
            )}

            {error && (
              <div className="auth-message auth-error" role="alert">
                <LockKeyhole />
                <span>{error}</span>
              </div>
            )}

            {resetSent && (
              <div className="auth-message auth-success" role="status">
                <CheckCircle2 />
                <span>{t("auth.resetSent")}</span>
              </div>
            )}

            <Button
              className="login-submit"
              type="submit"
              disabled={submitting || !configured}
            >
              {view === "sign-in"
                ? submitting
                  ? t("auth.signingIn")
                  : t("auth.signIn")
                : submitting
                  ? t("auth.sendingReset")
                  : t("auth.sendReset")}
              <ArrowRight />
            </Button>

            {view === "sign-in" && quickLogin && (
              <Button
                className="login-quick"
                type="button"
                variant="outline"
                disabled={submitting || !configured}
                onClick={() => {
                  void handleQuickLogin();
                }}
              >
                <Zap />
                {submitting ? t("auth.signingIn") : t("auth.quickSignIn")}
              </Button>
            )}

            {view === "sign-in" ? (
              <button
                className="login-text-button"
                type="button"
                onClick={openReset}
              >
                {t("auth.forgotPassword")}
              </button>
            ) : (
              <button
                className="login-text-button"
                type="button"
                onClick={openSignIn}
              >
                <ArrowLeft />
                {t("auth.backToSignIn")}
              </button>
            )}
          </form>
        </div>

        <p className="login-security-note">
          <ShieldCheck />
          {t("auth.secureDescription")}
        </p>
      </section>
    </main>
  );
}
