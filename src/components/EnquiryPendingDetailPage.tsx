import { QuoteEditorPage } from "@/components/QuoteEditorPage";

export function EnquiryPendingDetailPage({ canManage = false }: { canManage?: boolean }) {
  return <QuoteEditorPage pendingEnquiry canEdit={canManage} canCreateProduct={canManage} />;
}
