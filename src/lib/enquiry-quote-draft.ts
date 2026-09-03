import { mapEnquiryAnswers, type EnquiryAnswers, type EnquiryQuestion } from "@/lib/enquiry-form";
import type { EnquirySubmissionDetail } from "@/lib/enquiry-forms-api";
import type { QuoteDraft } from "@/lib/quote-editor";

export function quoteDraftFromEnquiry(submission: EnquirySubmissionDetail): QuoteDraft {
  const mapped = mapEnquiryAnswers(submission.formSnapshot, submission.answers ?? {});
  return {
    orderNumber: "",
    channelId: "",
    quoteStatus: "",
    quoteSalesSourceId: "",
    quoteCommunicationChannelId: "",
    followUpDate: "",
    customerName: mapped.customerName,
    companyName: mapped.companyName,
    famousBrandTagIds: [],
    isHongKongFamousBrand: false,
    contactA: mapped.phone,
    contactB: "",
    email: mapped.email,
    asanaLink: submission.asanaLink || "",
    address: mapped.address,
    districtId: "",
    districtName: "",
    shippingMethodId: "",
    deliveryDate: mapped.deliveryDate || "",
    deliveryTime: mapped.deliveryTime,
    shipOutTime: "",
    customerNote: mapped.quoteDescription,
    packingNote: mapped.headcount ? `人數：${mapped.headcount}` : "",
    salesPartnerId: "",
    internalNote: "",
    tagIds: [],
  };
}

export function patchQuoteDraftFromEnquiry(
  current: QuoteDraft,
  questions: EnquiryQuestion[],
  answers: EnquiryAnswers,
): QuoteDraft {
  const mapped = mapEnquiryAnswers(questions, answers);
  return {
    ...current,
    customerName: mapped.customerName,
    companyName: mapped.companyName,
    contactA: mapped.phone,
    email: mapped.email,
    address: mapped.address,
    deliveryDate: mapped.deliveryDate || current.deliveryDate,
    deliveryTime: mapped.deliveryTime || current.deliveryTime,
    customerNote: mapped.quoteDescription,
    packingNote: mapped.headcount ? `人數：${mapped.headcount}` : current.packingNote,
  };
}
