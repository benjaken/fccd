import { supabase } from "@/lib/supabase";

export type FactoryLabelCommandInput = {
  orderNumber: string;
  deliveryDate: string;
  labelName: string;
  remarks: string[];
  copies: number;
};

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
