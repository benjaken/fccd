import { describe, expect, it } from "vitest";

import {
  CATERING_ENQUIRY_SEED_FORM_ID,
  CATERING_ENQUIRY_SEED_QUESTIONS,
  cloneDefaultEnquiryQuestions,
} from "@/lib/enquiry-form-seed";
import {
  isEnquiryOptionCompact,
  enquiryOptionsShouldStack,
  convertEnquiryRequirements,
  emptyAnswers,
  enquiryPublicPath,
  enquiryQuestionElementId,
  mapEnquiryAnswers,
  reorderEnquiryQuestions,
  serializeEnquiryQuestions,
  validateEnquiryAnswers,
} from "@/lib/enquiry-form";

describe("catering enquiry seed form", () => {
  it("builds public URLs from the form id", () => {
    expect(enquiryPublicPath(CATERING_ENQUIRY_SEED_FORM_ID)).toBe(
      `/quote-inquiry/${CATERING_ENQUIRY_SEED_FORM_ID}`,
    );
    expect(enquiryQuestionElementId("name")).toBe("enquiry-question-name");
  });

  it("treats short option labels as two-up and long ones as full width", () => {
    expect(isEnquiryOptionCompact("先生")).toBe(true);
    expect(isEnquiryOptionCompact("正餐 到會  (大盤)")).toBe(true);
    expect(isEnquiryOptionCompact("新界區/九龍區 地面車邊交收 (+$50)")).toBe(false);
    expect(isEnquiryOptionCompact("需要分期付款，先付6成按金確認訂單，尾數在送餐當日付款")).toBe(false);
  });

  it("stacks a whole option group when any label is too long", () => {
    expect(enquiryOptionsShouldStack([
      { label: "先生" },
      { label: "小姐" },
      { label: "女士" },
      { label: "太太" },
    ])).toBe(false);
    expect(enquiryOptionsShouldStack([
      { label: "自有人手 Self Manpower" },
      { label: "現場司儀 MC" },
      { label: "遊戲節目主持 Game Host" },
    ])).toBe(true);
  });

  it("defaults a new form to the five contact questions", () => {
    expect(cloneDefaultEnquiryQuestions().map((question) => question.title)).toEqual([
      "姓名",
      "公司/機構名稱",
      "聯絡電話",
      "電郵地址",
      "送貨地址",
    ]);
  });

  it("reorders questions by field key", () => {
    const questions = cloneDefaultEnquiryQuestions();
    expect(reorderEnquiryQuestions(questions, "address", "name").map((question) => question.fieldKey)).toEqual([
      "address",
      "name",
      "company",
      "phone",
      "email",
    ]);
  });

  it("has 24 questions matching the live EmailMeForm", () => {
    expect(CATERING_ENQUIRY_SEED_QUESTIONS).toHaveLength(24);
    expect(CATERING_ENQUIRY_SEED_QUESTIONS.map((question) => question.title)).toEqual([
      "姓名",
      "稱謂",
      "公司/機構名稱",
      "聯絡電話",
      "電郵地址",
      "送貨地址",
      "有興趣了解的到會形式（可選多於一項）",
      "活動性質（可選多於一項）",
      "活動對象（可選多於一項）",
      "你預計的活動地點（可選多於一項）",
      "預算活動人數",
      "預算活動日期",
      "活動訂餐頻率",
      "菜式 (可選多於一項)",
      "預算活動時段",
      "送餐地區及方式（訂滿$2800可免地面交收運費）",
      "參與人手（可選多於一項）",
      "活動策劃（可選多於一項）",
      "環保餐具",
      "付款方式",
      "預算的彈性",
      "初步食物到會預算 (人均/總計)（方便出報價）",
      "特別需要或留言",
      "了解條款及政策",
    ]);
  });

  it("pre-checks both terms and blocks submit if either is cleared", () => {
    const answers = emptyAnswers(CATERING_ENQUIRY_SEED_QUESTIONS);
    expect(answers.terms).toEqual([
      "謹此聲明活動內所有參與的人士都年滿 18 歲或以上",
      "本人確認已經細閱、明白及同意網上購物條款及細則及私隱政策，及個人資料的收集及使用",
    ]);
    answers.terms = [String((answers.terms as string[])[0])];
    const errors = validateEnquiryAnswers(CATERING_ENQUIRY_SEED_QUESTIONS, answers);
    expect(errors.some((error) => error.fieldKey === "terms")).toBe(true);
  });

  it("allows optional company and maps identity fields for conversion", () => {
    const answers = emptyAnswers(CATERING_ENQUIRY_SEED_QUESTIONS);
    answers.name = "陳大文";
    answers.salutation = "先生";
    answers.phone = "91234567";
    answers.email = "guest@example.com";
    answers.address = "九龍灣";
    answers.catering_style = ["水果餐盒"];
    answers.headcount = 20;
    answers.event_date = "2026-10-01";
    answers.event_time = "平日中午(大約11-2pm)";
    answers.delivery_area = "未確定送貨方式";
    answers.utensils = ["必須要環保餐具"];
    answers.budget = "$15000-20000";
    answers.remarks = "素食為主";

    expect(validateEnquiryAnswers(CATERING_ENQUIRY_SEED_QUESTIONS, answers)).toEqual([]);
    const mapped = mapEnquiryAnswers(CATERING_ENQUIRY_SEED_QUESTIONS, answers);
    expect(mapped.customerName).toBe("陳大文");
    expect(mapped.salutation).toBe("先生");
    expect(mapped.phone).toBe("91234567");
    expect(mapped.email).toBe("guest@example.com");
    expect(mapped.deliveryDate).toBe("2026-10-01");
    expect(mapped.headcount).toBe("20");
    expect(mapped.quoteDescription).toBe("素食為主");
    expect(convertEnquiryRequirements(mapped)).toEqual([]);
  });

  it("does not treat shipping-fee option text as mapped quote fields", () => {
    const answers = emptyAnswers(CATERING_ENQUIRY_SEED_QUESTIONS);
    answers.delivery_area = "港島區 地面車邊交收 (+$100)";
    const mapped = mapEnquiryAnswers(CATERING_ENQUIRY_SEED_QUESTIONS, answers);
    expect(mapped.deliveryTime).toBe("");
    expect(JSON.stringify(serializeEnquiryQuestions(CATERING_ENQUIRY_SEED_QUESTIONS))).toContain("+$100");
  });
});
