import { FOOD_CHANNEL_CATERING_LOGO_PATH } from "@/lib/brand-logo";

export function FactoryBrandLogo() {
  return (
    <div className="factory-board-brand">
      <img src={FOOD_CHANNEL_CATERING_LOGO_PATH} alt="Food Channel Catering" />
    </div>
  );
}
