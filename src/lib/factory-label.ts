import { supabase } from "@/lib/supabase";

export type FactoryDishLabelCommandInput = {
  kind?: "dish";
  orderNumber: string;
  deliveryDate: string;
  labelName: string;
  remarks: string[];
  copies: number;
};

export type FactoryAddressLabelCommandInput = {
  kind: "address";
  orderNumber: string;
  address: string;
  arrivalWindow: string;
  customerName: string;
  customerPhone: string;
};

export type FactoryLabelCommandInput =
  | FactoryDishLabelCommandInput
  | FactoryAddressLabelCommandInput;

export type FactoryLabelCommandLoader = (
  input: FactoryLabelCommandInput,
) => Promise<string>;

export const fetchFactoryLabelCommand: FactoryLabelCommandLoader = async (input) => {
  const { data, error } = await supabase.functions.invoke("qz-label-tspl", {
    body: input,
  });
  if (error) throw error;
  const commandBase64 = data?.commandBase64;
  if (typeof commandBase64 !== "string" || !commandBase64) {
    throw new Error("factory_label_command_missing");
  }
  return commandBase64;
};
