import { REPLIES } from "./customer-service-replies.ts";

/**
 * Some historical outbound messages were sent by earlier versions of the bot
 * (or by WATI automations) that did not carry the `fcc-bot-` local id and used
 * a human-looking `operator_name`. They therefore looked like 真人 replies to
 * `classifyWatiHistoryRole`. This module detects those canned/automated replies
 * from their wording so the import (and any learning that reads it) never treats
 * them as human answers.
 */

function normalizeReply(value: string) {
  return String(value ?? "")
    .replace(/^【develop】/u, "")
    .toLowerCase()
    .replace(/[\s，。！？、,.!?：:；;（）()「」『』"'’“”·]/gu, "")
    .trim();
}

/** Exact canned replies currently used by the bot. */
const EXACT_TEMPLATES = new Set(Object.values(REPLIES).map((value) => normalizeReply(value)));

/**
 * Signatures of older automated replies observed in the WATI history. Kept as
 * normalized substrings because the wording drifted between bot versions.
 */
const OLD_AUTOMATED_SIGNATURES = [
  "只可以幫你查訂單",                  // refuse (喺度／呢度 variants)
  "未搵到用呢個",                      // older noFaq
  "已經幫你記低",                      // collectDone / handoff
  "客服會喺下一個工作日上午9點後",
  "客服會喺上午9點後",
  "系統暫時未能完成呢則回覆",
  "已經為你建立客服跟進",
  "呢個問題需要同事處理",
  "同事會跟進。唔使再喺whatsapp補電郵",
  "麻煩再提供活動日期或者人數",
  "將補充資料加入同一個",
];

export function isLegacyAutomatedReply(text: string): boolean {
  const normalized = normalizeReply(text);
  if (!normalized) return false;
  if (EXACT_TEMPLATES.has(normalized)) return true;
  return OLD_AUTOMATED_SIGNATURES.some((signature) => normalized.includes(signature));
}
