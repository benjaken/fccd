import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, LoaderCircle } from "lucide-react";

import { translateDistrictToTraditionalChinese } from "@/lib/address-tools";

export function DistrictTranslationButton({
  district,
  disabled = false,
  onTranslated,
  translateDistrict = translateDistrictToTraditionalChinese,
}: {
  district: string;
  disabled?: boolean;
  onTranslated: (district: string) => void | Promise<void>;
  translateDistrict?: typeof translateDistrictToTraditionalChinese;
}) {
  const { i18n } = useTranslation();
  const [translating, setTranslating] = useState(false);
  const [failed, setFailed] = useState(false);
  const isEnglish = i18n.resolvedLanguage?.startsWith("en");
  const label = translating
    ? (isEnglish ? "Translating…" : "AI 翻譯中…")
    : (isEnglish ? "AI translate" : "AI 翻譯");

  const handleClick = async () => {
    if (!district.trim() || disabled || translating) return;
    setFailed(false);
    setTranslating(true);
    try {
      await onTranslated(await translateDistrict(district));
    } catch {
      setFailed(true);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="district-translation-action">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled || translating || !district.trim()}
        onClick={() => void handleClick()}
      >
        {translating ? <LoaderCircle className="spin" aria-hidden="true" /> : <Languages aria-hidden="true" />}
      </button>
      {failed ? <small role="alert">{isEnglish ? "Translation failed" : "翻譯失敗"}</small> : null}
    </div>
  );
}
