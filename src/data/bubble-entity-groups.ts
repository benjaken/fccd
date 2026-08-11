import type { BubbleObjectType } from "@/data/bubble-object-types";

export type BubbleEntityGroup = {
  key:
    | "customerCrm"
    | "ordersQuotes"
    | "productsPackages"
    | "ingredientsProduction"
    | "delivery"
    | "paymentsPurchasing"
    | "meatInventory"
    | "shopOperations"
    | "calendarSystem";
  objectTypes: readonly BubbleObjectType[];
};

export const BUBBLE_ENTITY_GROUPS = [
  {
    key: "customerCrm",
    objectTypes: [
      "A_Customers",
      "M_customer",
      "DS_customer_tag",
      "DS_customer_tag_type",
      "S_customer_tag",
      "DS_Sales Partner",
      "DS_Channel",
      "DS Commu Channels (quote)",
      "DS Source of sales (quote)",
      "DS reminder person(first)",
      "DS reminder person(second)",
    ],
  },
  {
    key: "ordersQuotes",
    objectTypes: [
      "A_Order",
      "S_Order",
      "S_comment",
      "NOS_order Tag",
      "quote_file",
      "quote_payment method",
      "quote_T&C",
      "DS_quote_T&C",
      "DS_quote_payment",
      "DS_quote_delivery",
    ],
  },
  {
    key: "productsPackages",
    objectTypes: [
      "A_Packages",
      "A_Products",
      "S_Packages_Product",
      "S_Packages_ChoiceSet",
      "Cal_Package_choice",
      "DS AO product",
      "DS_Collection",
      "DS_CookType",
      "DS_Type",
      "DS_Tags",
      "A_Label",
      "bento_main type",
      "bento_main ingredients",
      "bento_number of column",
      "bento_special request",
      "DS_bento_additional item",
      "DS_bento_event part",
      "Quote_bento_additional item",
      "Quote_bento_event part",
      "OS driver_menu",
      "Print_Label",
      "Font",
      "MM_Products",
    ],
  },
  {
    key: "ingredientsProduction",
    objectTypes: [
      "DS_Ingredients",
      "S_Ingredients_Product",
      "B_Product_Ingredients",
      "DS_Packing",
      "Cal_Control",
      "M_cal_to_kg",
      "M_calculation%",
    ],
  },
  {
    key: "delivery",
    objectTypes: [
      "B_delivery schedule",
      "B_delivery schedule_surcharge",
      "DS_delivery district",
      "DS_delivery surcharge",
      "DS_Shipping Method",
      "DS_Super_Motorcade",
      "DS_Super_Motorcade_subDriver",
      "DS_driver assign remind",
      "M_shippingMethod",
    ],
  },
  {
    key: "paymentsPurchasing",
    objectTypes: [
      "S_Payment",
      "S_Payment Report",
      "DS_Payment Method",
      "B_cost monthly",
      "DS_cost_type",
      "B_supplierPurchase",
      "B_ads cost weekly",
      "DS_Purchase Type",
      "DS__ingredient_Supplier",
    ],
  },
  {
    key: "meatInventory",
    objectTypes: [
      "M_rawMeat",
      "M_raw_stock",
      "M_doneMeat",
      "M_doneMeat_stock",
      "M_outDone_order",
      "M_outDone_doneMeat",
      "M_seasoning",
      "M_MeatSeasoning_cost",
      "M_Monthly_MeatPrice",
      "S_ingredient_stocktake",
      "S_Packing_Stocktake",
    ],
  },
  {
    key: "shopOperations",
    objectTypes: [
      "SHOP_dailySales",
      "SHOP_DS cost",
      "SHOP_DS Cost_type",
      "SHOP_DS_holiday",
      "SHOP_DS_new_product",
      "SHOP_DS payment method",
      "SHOP DS Restro",
      "SHOP_DS_restro_depart",
      "SHOP_DS_staff_list",
      "SHOP DS restro_period",
      "SHOP_food_deli_platform",
      "SHOP_Ingredients",
      "SHOP_monthly_cost",
      "SHOP_roster",
      "SHOP_StockTake",
      "SHOP_supplier_purchase",
      "SHOP_DS_time_slot",
      "SHOP DS_Purchase Type",
    ],
  },
  {
    key: "calendarSystem",
    objectTypes: [
      "DS AO_blockDate",
      "DS_Festival",
      "DS_Status",
      "User",
      "Announcement",
    ],
  },
] as const satisfies readonly BubbleEntityGroup[];

