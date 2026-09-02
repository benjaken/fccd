import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, LoaderCircle, MapPin } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import {
  googleMapsEmbedUrl,
  translateAddressToTraditionalChinese,
} from "@/lib/address-tools";

type DeliveryAddressActionsProps = {
  address: string;
  onTranslated: (address: string) => void;
  translateAddress?: typeof translateAddressToTraditionalChinese;
};

export function DeliveryAddressActions({
  address,
  onTranslated,
  translateAddress = translateAddressToTraditionalChinese,
}: DeliveryAddressActionsProps) {
  const { i18n } = useTranslation();
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const mapsUrl = googleMapsEmbedUrl(address);
  const isEnglish = i18n.resolvedLanguage?.startsWith("en");
  const labels = isEnglish
    ? {
        translate: "Translate to Traditional Chinese with AI",
        translating: "Translating…",
        maps: "Locate on Google Maps",
        mapTitle: "Google Maps location",
        mapDescription: "Check whether Google Maps can locate this delivery address accurately.",
        close: "Close map",
        error: "Unable to translate. Please try again.",
      }
    : {
        translate: "AI 翻譯成繁體中文",
        translating: "AI 翻譯中…",
        maps: "Google 地圖定位",
        mapTitle: "Google 地圖定位",
        mapDescription: "查看 Google 地圖能否準確定位目前的送貨地址。",
        close: "關閉地圖",
        error: "翻譯失敗，請稍後再試。",
      };

  const handleTranslate = async () => {
    if (!address.trim() || translating) return;
    setError("");
    setTranslating(true);
    try {
      onTranslated(await translateAddress(address));
    } catch (translationError) {
      console.error("Address translation failed", translationError);
      setError(labels.error);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="delivery-address-actions">
      <div>
        <button
          type="button"
          aria-label={translating ? labels.translating : labels.translate}
          title={translating ? labels.translating : labels.translate}
          disabled={!address.trim() || translating}
          onClick={() => void handleTranslate()}
        >
          {translating ? <LoaderCircle className="spin" aria-hidden="true" /> : <Languages aria-hidden="true" />}
        </button>
        <button
          type="button"
          aria-label={labels.maps}
          title={labels.maps}
          disabled={!mapsUrl}
          onClick={() => setMapOpen(true)}
        >
          <MapPin aria-hidden="true" />
        </button>
      </div>
      {error ? <small role="alert">{error}</small> : null}
      <Modal
        open={mapOpen && Boolean(mapsUrl)}
        onClose={() => setMapOpen(false)}
        title={labels.mapTitle}
        description={labels.mapDescription}
        closeLabel={labels.close}
        size="lg"
        className="delivery-address-map-modal"
      >
        <p className="delivery-address-map-query">{address.trim()}</p>
        <iframe
          className="delivery-address-map-frame"
          title={labels.mapTitle}
          src={mapsUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </Modal>
    </div>
  );
}
