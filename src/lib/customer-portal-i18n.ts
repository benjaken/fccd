import i18n from "@/i18n";

i18n.addResourceBundle("zh-HK", "translation", { portal: {
  title:"客戶服務平台", customerMode:"客戶登入方式", personalCustomer:"個人客戶", organizationCustomer:"機構客戶", logout:"登出", loading:"載入中…", welcome:"歡迎使用 FCCD", loginDescription:"登入所屬機構，查看指定餐單及訂購。",
  otpDescription:"輸入電郵，使用驗證碼登入客戶服務。",otpCode:"8 位驗證碼",otpPlaceholder:"輸入電郵中的 8 位驗證碼",otpSend:"發送驗證碼",otpVerify:"驗證並登入",otpResend:"重新發送",otpChangeEmail:"更換電郵",otpSent:"如電郵可接收驗證碼，請查閱收件箱及垃圾郵件。",otpSendFailed:"暫時未能發送驗證碼，請稍後重試。",otpInvalid:"驗證碼無效或已過期，請核對或重新發送。",contactPhone:"訂單電話",contactPhoneHint:"輸入下單時的電話。系統會自動列出與此帳戶電郵及該電話相符的過往訂單。",contactPhoneSave:"配對訂單",contactPhoneInvalid:"請輸入有效電話號碼。",otpPrivacy:"你的電郵只用作核實登入身份。",otpProfileHint:"本帳戶使用電郵驗證碼登入，無須設定密碼。",personalContext:"目前身份：個人客戶",organizationContext:"目前身份：機構客戶",
  loadFailedTitle:"未能載入客戶資料",loadingDetails:"正在取得你的機構資料，請稍候。",
  refreshPayment:"更新付款狀態",
  backToOrders:"返回訂單紀錄",
  financialDocuments:"收據及發票",documentsHint:"付款完成並經核實後，可預覽及下載收據、發票。",download:{receipt:"下載收據",invoice:"下載發票"},
  reviewPayments:"付款單據審核",financeAccessRequired:"請以獲授權的財務帳戶登入後再使用。",paymentMethod:"付款方式",chooseMethod:"選擇付款方式",reviewReason:"審核原因",reviewReasonPlaceholder:"拒絕時須填寫原因",noReview:"沒有待審核付款單據。",viewEvidence:"查看單據",acceptPayment:"核實付款",rejectPayment:"要求重新提交",
  receipts:"付款單據",evidenceHint:"支援 JPG、PNG、PDF，每檔最多 10MB。上載後待財務審核，不會立即標記已付款。",evidenceSubmitted:"付款單據已提交，等待審核。",chooseOrder:"選擇待付款訂單",paymentAmount:"付款金額",receiptFile:"付款單據",submitEvidence:"提交單據",evidenceStatus:{pending:"待審核",accepted:"已核實",rejected:"需重新提交"},
  email:"電郵", password:"密碼", emailPlaceholder:"輸入電郵地址", passwordPlaceholder:"輸入密碼", login:"登入", register:"建立受邀帳戶", verifyEmail:"請查閱電郵完成驗證，再登入接受邀請。",
  forgotPassword:"重設密碼", resetSent:"重設密碼電郵已發出，請查閱收件箱。", lookup:"使用電話及電郵查單", invitation:"機構邀請", acceptInvite:"接受邀請", joined:"已加入機構。",
  membershipRequired:"此帳戶尚未取得機構訂購權限。請先完成電郵驗證，並透過機構管理員提供的邀請連結加入；如已加入，請聯絡管理員確認帳戶及機構是否仍有效。", loadFailed:"暫時無法載入機構資料，請重試；如問題持續，請聯絡客服。", operationFailed:"操作未完成，請核對資料及權限後重試。", retry:"重試", navigation:"客戶功能", openMenu:"開啟選單", closeMenu:"關閉選單",
  home:"主頁", menus:"最新餐單", orders:"訂單紀錄", points:"獎勵積分", team:"團隊管理", addresses:"送貨地址", profile:"個人資料",
  headline:"幾步就訂好。", homeDescription:"選擇指定餐單，確認送貨資料，快捷完成訂購。", orderNow:"立即訂購", details:"查看明細", pointUnit:"分",
  choose:"選擇餐單", noMenus:"目前沒有可訂購餐單，請聯絡營運核對授權。", available:"可訂 {{count}} 份", quantityLabel:"{{name}} 數量", chooseAddress:"選擇送貨地址", addAddress:"新增地址", editAddress:"編輯地址", deleteAddress:"刪除地址", cancelEdit:"取消編輯", addressArchived:"已刪除地址。",
  pointsHint:"每消費 HK$25 餐費得 1 分，訂單完成後 1 個工作日內入帳。運費不計分。積分只可兌換實物或現金券，不可抵付金額。", shipping:"運費", payable:"應付金額", submitting:"提交中…", confirmOrder:"提交預備訂單",
  orderCreated:"已提交預備訂單，等待 FCCD 確認。確認後才會成為正式訂單。", noOrders:"目前沒有訂單。", awaitingConfirmation:"待確認", confirmed:"已確認", settled:"已結清", awaitingPayment:"待付款", reorder:"再次訂購",
  reorderNotice:"已帶入仍可供應的餐點，請核對數量及最新價格；未提供的餐點不會加入。", cancelReason:"請輸入取消原因", cancelRequested:"已提交取消申請，等待營運確認。", requestCancel:"申請取消", cancelPending:"取消申請已提交",
  rewardRules:"個人與企業積分分開。每消費 HK$25 餐費得 1 分，訂單完成後 1 個工作日內入帳，有效期一年。積分只可兌換實物或現金券，不可抵付金額。", expires:"到期", noLedger:"目前沒有積分交易。",
  ledger:{earn:"完成訂單儲分",redeem:"兌換實物或現金券",return:"退款退分",expire:"積分到期",clawback:"退款追回積分"},
  addressFields:{label:"地址名稱",recipient:"收件人",phone:"電話",address:"送貨地址"},addressPlaceholders:{label:"例如：辦公室",recipient:"輸入收件人姓名",phone:"輸入聯絡電話",address:"輸入完整送貨地址"},
  save:"儲存", saved:"已儲存。", roles:{admin:"機構管理員",member:"機構成員"},active:"有效",inactive:"已停用",remove:"停用成員",createInvite:"建立邀請連結",inviteLink:"邀請連結（7 日內有效，請交予指定收件人）",
  members:"成員",pendingInvites:"待接受邀請",noPendingInvites:"目前沒有待接受邀請。",revokeInvite:"取消邀請",inviteRevoked:"已取消邀請。",inviteExpires:"有效期至 {{date}}",
  promoteAdmin:"設為管理員",demoteMember:"改為成員",roleUpdated:"角色已更新。",
  templates:"常用訂單",noTemplates:"尚未儲存常用訂單。",applyTemplate:"套用常用訂單",saveTemplate:"儲存為常用訂單",deleteTemplate:"刪除常用訂單",
  templateName:"常用訂單名稱",templateNamePlaceholder:"例如：每週例會餐",templateSaved:"已儲存常用訂單。",templateArchived:"已刪除常用訂單。",
  templateApplied:"已套用常用訂單。",templatePartialNotice:"部分餐點已從目前餐單移除，其餘項目已帶入，請核對數量。",manageTemplates:"管理常用訂單",
  menuScopesHint:"勾選此成員可訂購的指定餐單；全部取消勾選即恢復可訂全部餐單。",
  noAssignableMenus:"目前沒有可分配的指定餐單。",menuScopesAll:"目前可訂全部餐單。",menuScopesSelected:"已限制 {{count}} 張餐單。",
  saveMenuScopes:"儲存餐牌權限",menuScopesSaved:"已更新餐牌權限。",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalOps: {
  description:"建立機構、指定首位管理員，並配置指定餐單、價格、庫存、截單及運費。",
  loading:"載入中…",saved:"已儲存。",close:"關閉",accessDenied:"沒有客戶訂購營運權限。",operationFailed:"操作未完成，請重試。",
  userNotFound:"找不到已驗證電郵的使用者。",membershipConflict:"此使用者已屬於其他機構。",invalidEmail:"電郵格式無效。",invalidMenu:"請核對餐單欄位及餐點。",
  createOrg:"新增機構",editOrg:"編輯機構",orgName:"機構名稱",noOrgs:"尚未建立機構。",active:"有效",inactive:"停用",
  admins:"管理員",members:"成員",menus:"指定餐單",status:"狀態",save:"儲存",
  assignAdmin:"指定管理員",adminEmailPlaceholder:"已驗證的管理員電郵",adminAssigned:"已指定管理員。",
  email:"電郵",role:"角色",createMenu:"新增餐單",editMenu:"編輯餐單",menuName:"餐單名稱",brand:"品牌",
  chooseBrand:"選擇品牌",delivery:"送貨",deliveryDate:"送貨日期",deliveryTime:"送貨時間",cutoff:"截單時間",
  fee:"運費",items:"餐點",product:"產品",sku:"SKU",unitPrice:"單價",stock:"可訂數量",
  chooseProduct:"選擇產品",addItem:"加入餐點",removeItem:"移除餐點",
  backToList:"返回機構列表",backToOrg:"返回機構",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalRewardRules: {
  description:"設定全平台「每多少港元合資格餐費可得 1 分」版本。新單於提交時鎖定生效版本；已生效版本不可覆寫。",
  loading:"載入中…",saved:"已新增積分規則版本。",close:"關閉",save:"儲存",
  accessDenied:"沒有客戶積分規則權限。",operationFailed:"操作未完成，請重試。",
  invalidRewardRule:"請輸入 0 至 100000 的港元門檻，並指定生效時間。0 表示暫停賺分。",
  duplicateEffectiveAt:"此生效時間已有規則版本，請改用其他時間。",
  createVersion:"新增規則版本",hkdPerPoint:"每 1 分所需餐費（HK$）",
  hkdPerPointHint:"例如 25 時，合資格餐費 HK$100 會在完成後 1 個工作日內入帳 4 分，不足 HK$25 的餘額捨去。0 只暫停賺分。運費不計分。積分只可兌換實物或現金券，不可抵付金額。",
  effectiveAt:"生效時間",effectiveAtHint:"只影響生效時間之後提交的新單；已鎖定規則的舊單不變。",
  createdAt:"建立時間",status:"狀態",active:"目前生效",scheduled:"已排程",superseded:"已取代",
  currentActive:"目前生效：每 HK${{rate}} 餐費得 1 分（自 {{at}}）",
  noRules:"尚未有積分規則版本。",history:"規則版本紀錄",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portal: {
  title:"Customer portal",customerMode:"Customer sign-in mode",personalCustomer:"Individual customer",organizationCustomer:"Organization customer",logout:"Sign out",loading:"Loading…",welcome:"Welcome to FCCD",loginDescription:"Sign in to your organization to order from assigned menus.",
  otpDescription:"Enter your email to sign in with a verification code.",otpCode:"8-digit verification code",otpPlaceholder:"Enter the 8-digit code from your email",otpSend:"Send verification code",otpVerify:"Verify and sign in",otpResend:"Resend code",otpChangeEmail:"Change email",otpSent:"If the email can receive a code, check your inbox and spam folder.",otpSendFailed:"Unable to send a code. Please try again later.",otpInvalid:"The code is invalid or expired. Check it or request a new code.",contactPhone:"Order phone",contactPhoneHint:"Enter the phone used on the order. Past orders with this account email and that phone are listed automatically.",contactPhoneSave:"Match orders",contactPhoneInvalid:"Enter a valid phone number.",otpPrivacy:"Your email is used to verify your sign-in identity.",otpProfileHint:"This account signs in with email verification codes. No password is required.",personalContext:"Current identity: Individual",organizationContext:"Current identity: Organization",
  loadFailedTitle:"Customer details unavailable",loadingDetails:"Loading your organization details. Please wait.",
  refreshPayment:"Refresh payment status",
  backToOrders:"Back to orders",
  financialDocuments:"Receipts and invoices",documentsHint:"Download receipts and invoices after payment verification.",download:{receipt:"Download receipt",invoice:"Download invoice"},
  reviewPayments:"Payment evidence review",financeAccessRequired:"Sign in with an authorized finance account.",paymentMethod:"Payment method",chooseMethod:"Choose payment method",reviewReason:"Review reason",reviewReasonPlaceholder:"A reason is required for rejection",noReview:"No evidence awaiting review.",viewEvidence:"View evidence",acceptPayment:"Verify payment",rejectPayment:"Request resubmission",
  receipts:"Payment evidence",evidenceHint:"JPG, PNG or PDF, up to 10 MB. Uploads require finance review before being marked paid.",evidenceSubmitted:"Evidence submitted for review.",chooseOrder:"Choose unpaid order",paymentAmount:"Payment amount",receiptFile:"Payment evidence file",submitEvidence:"Submit evidence",evidenceStatus:{pending:"Pending review",accepted:"Verified",rejected:"Resubmit"},
  email:"Email",password:"Password",emailPlaceholder:"Enter email",passwordPlaceholder:"Enter password",login:"Sign in",register:"Create invited account",verifyEmail:"Verify your email, then sign in to accept the invitation.",
  forgotPassword:"Reset password",resetSent:"Check your inbox for the reset link.",lookup:"Look up orders by phone and email",invitation:"Organization invitation",acceptInvite:"Accept invitation",joined:"Organization joined.",
  membershipRequired:"This account does not currently have organization ordering access. Verify your email and join using an invitation link from your organization administrator. If you have already joined, ask the administrator to confirm that your account and organization are active.",loadFailed:"Unable to load organization details. Please retry. If the problem persists, contact support.",operationFailed:"Could not complete the action. Check your details and permissions, then retry.",retry:"Retry",navigation:"Customer navigation",openMenu:"Open menu",closeMenu:"Close menu",
  home:"Home",menus:"Menus",orders:"Orders",points:"Rewards",team:"Team",addresses:"Addresses",profile:"Profile",headline:"Your order, in a few steps.",homeDescription:"Choose a menu and confirm delivery details.",orderNow:"Order now",details:"View details",pointUnit:"points",
  choose:"Choose menu",noMenus:"No menus available. Contact operations to check access.",available:"{{count}} available",quantityLabel:"{{name}} quantity",chooseAddress:"Choose address",addAddress:"Add address",editAddress:"Edit address",deleteAddress:"Delete address",cancelEdit:"Cancel edit",addressArchived:"Address deleted.",pointsHint:"Earn 1 point for every HK$25 of food. Points post within one business day after the order is completed. Delivery is excluded. Points can be exchanged for goods or cash vouchers, and cannot reduce the amount due.",shipping:"Delivery",payable:"Amount due",submitting:"Submitting…",confirmOrder:"Submit preliminary order",orderCreated:"Preliminary order submitted. It becomes a confirmed order after FCCD review.",noOrders:"No orders yet.",awaitingConfirmation:"Awaiting confirmation",confirmed:"Confirmed",settled:"Settled",awaitingPayment:"Awaiting payment",reorder:"Order again",reorderNotice:"Available items were copied. Review quantities and current prices; unavailable items were omitted.",cancelReason:"Enter cancellation reason",cancelRequested:"Cancellation requested. Awaiting operations review.",requestCancel:"Request cancellation",cancelPending:"Cancellation requested",rewardRules:"Personal and organization points stay separate. Earn 1 point per HK$25 of food when the order is completed, valid for one year. Points redeem gifts and cannot reduce the amount due.",expires:"Expires",noLedger:"No rewards transactions yet.",ledger:{earn:"Order rewards",redeem:"Redemption",return:"Returned points",expire:"Expired points",clawback:"Refund clawback"},addressFields:{label:"Label",recipient:"Recipient",phone:"Phone",address:"Delivery address"},addressPlaceholders:{label:"e.g. Office",recipient:"Enter recipient",phone:"Enter phone",address:"Enter full address"},save:"Save",saved:"Saved.",roles:{admin:"Organization admin",member:"Member"},active:"Active",inactive:"Inactive",remove:"Deactivate",createInvite:"Create invitation link",inviteLink:"Invitation link (valid for 7 days; share with the specified recipient)",
  members:"Members",pendingInvites:"Pending invitations",noPendingInvites:"No pending invitations.",revokeInvite:"Cancel invitation",inviteRevoked:"Invitation cancelled.",inviteExpires:"Expires {{date}}",
  promoteAdmin:"Make admin",demoteMember:"Make member",roleUpdated:"Role updated.",
  templates:"Saved orders",noTemplates:"No saved orders yet.",applyTemplate:"Apply saved order",saveTemplate:"Save as saved order",deleteTemplate:"Delete saved order",
  templateName:"Saved order name",templateNamePlaceholder:"e.g. Weekly meeting meal",templateSaved:"Saved order stored.",templateArchived:"Saved order deleted.",
  templateApplied:"Saved order applied.",templatePartialNotice:"Some items are unavailable on the current menu. Remaining items were loaded; review quantities.",manageTemplates:"Manage saved orders",
  menuScopesHint:"Select the assigned menus this member may order. Clearing all selections restores access to every menu.",
  noAssignableMenus:"No assignable menus yet.",menuScopesAll:"Currently allowed to order from all menus.",menuScopesSelected:"Limited to {{count}} menus.",
  saveMenuScopes:"Save menu access",menuScopesSaved:"Menu access updated.",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalOps: {
  description:"Create organizations, assign the first admin, and configure assigned menus, prices, stock, cutoffs and delivery fees.",
  loading:"Loading…",saved:"Saved.",close:"Close",accessDenied:"You do not have customer ordering ops access.",operationFailed:"Could not complete the action. Please retry.",
  userNotFound:"No verified user was found for that email.",membershipConflict:"That user already belongs to another organization.",invalidEmail:"Invalid email format.",invalidMenu:"Check the menu fields and items.",
  createOrg:"Create organization",editOrg:"Edit organization",orgName:"Organization name",noOrgs:"No organizations yet.",active:"Active",inactive:"Inactive",
  admins:"Admins",members:"Members",menus:"Assigned menus",status:"Status",save:"Save",
  assignAdmin:"Assign admin",adminEmailPlaceholder:"Verified admin email",adminAssigned:"Admin assigned.",
  email:"Email",role:"Role",createMenu:"Create menu",editMenu:"Edit menu",menuName:"Menu name",brand:"Brand",
  chooseBrand:"Choose brand",delivery:"Delivery",deliveryDate:"Delivery date",deliveryTime:"Delivery time",cutoff:"Cutoff",
  fee:"Delivery fee",items:"Items",product:"Product",sku:"SKU",unitPrice:"Unit price",stock:"Available qty",
  chooseProduct:"Choose product",addItem:"Add item",removeItem:"Remove item",
  backToList:"Back to organizations",backToOrg:"Back to organization",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalRewardRules: {
  description:"Configure how many Hong Kong dollars of eligible food earn 1 point. New orders lock the active version at submit; past versions are immutable.",
  loading:"Loading…",saved:"Reward rule version created.",close:"Close",save:"Save",
  accessDenied:"You do not have customer reward-rule access.",operationFailed:"Could not complete the action. Please retry.",
  invalidRewardRule:"Enter a Hong Kong dollar threshold from 0 to 100000 and choose an effective time. 0 pauses earning.",
  duplicateEffectiveAt:"A rule already uses that effective time. Choose a different time.",
  createVersion:"Create rule version",hkdPerPoint:"Food spend per point (HK$)",
  hkdPerPointHint:"Example: 25 awards 4 points for HK$100 eligible food, posted within one business day after completion. Amounts under HK$25 are discarded. 0 pauses earning. Delivery is excluded. Points can be exchanged for goods or cash vouchers, and cannot reduce the amount due.",
  effectiveAt:"Effective at",effectiveAtHint:"Applies only to orders submitted on or after this time; locked historical orders stay unchanged.",
  createdAt:"Created at",status:"Status",active:"Active now",scheduled:"Scheduled",superseded:"Superseded",
  currentActive:"Active now: 1 point per HK${{rate}} of food (since {{at}})",
  noRules:"No reward rule versions yet.",history:"Rule version history",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalApply: {
  title:"申請公司帳戶",
  description:"提交公司名稱、商業登記證及送貨點。FCC 核對並指定首位管理員後，申請人不會因填寫 BR 自動取得公司權限。",
  companyName:"公司名稱",brNumber:"BR 號碼",brExpiresOn:"BR 有效期",attachment:"BR 附件（JPG、PNG 或 PDF，最多 10MB）",
  attachmentReady:"已有 BR 附件。可重新選擇檔案取代。",
  contacts:"聯絡人",contactName:"姓名",contactPhone:"電話",contactTitle:"職位",primaryContact:"主要聯絡人",addContact:"新增聯絡人",
  addresses:"公司送貨點",addAddress:"新增送貨點",saveDraft:"儲存草稿",submit:"提交審核",
  saved:"草稿已儲存。",submitted:"已提交，等待 FCC 審核。",
  approvedHint:"申請已批准。請使用 FCC 指定的管理員帳戶登入；填寫 BR 本身不會加入公司。",
  invalidAttachment:"請上載 JPG、PNG 或 PDF，且每檔不超過 10MB。",
  invalidBr:"請核對 BR 號碼及有效期。",invalidContact:"請核對聯絡人姓名、電話及職位，並只設一位主要聯絡人。",
  invalidAddress:"請核對送貨點名稱、收件人、電話及地址。",
  invalidApplication:"請填寫至少一位主要聯絡人、一個送貨點，並附上 BR 檔案。",
  brExpired:"這份 BR 已過有效期，按目前政策不能提交。",
  locked:"申請審核中，暫時不能修改。",alreadyApproved:"此帳戶已有已批准的公司申請。",
  membershipExists:"此帳戶已屬於一間公司，不能再提交新公司申請。",operationFailed:"申請未完成，請核對資料後重試。",
  status:{draft:"草稿",pending_review:"待審核",needs_info:"需補資料",rejected:"已拒絕",approved:"已批准"},
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalApply: {
  title:"Apply for a company account",
  description:"Submit the company name, business registration and delivery points. FCC reviews the BR and assigns the first admin. Filing a BR does not grant company access.",
  companyName:"Company name",brNumber:"BR number",brExpiresOn:"BR expiry",attachment:"BR file (JPG, PNG or PDF, up to 10MB)",
  attachmentReady:"A BR file is already attached. Choose another file to replace it.",
  contacts:"Contacts",contactName:"Name",contactPhone:"Phone",contactTitle:"Title",primaryContact:"Primary contact",addContact:"Add contact",
  addresses:"Company delivery points",addAddress:"Add delivery point",saveDraft:"Save draft",submit:"Submit for review",
  saved:"Draft saved.",submitted:"Submitted. Waiting for FCC review.",
  approvedHint:"The application is approved. Sign in with the admin FCC assigned. Filing the BR does not join the company by itself.",
  invalidAttachment:"Upload a JPG, PNG or PDF no larger than 10MB.",
  invalidBr:"Check the BR number and expiry date.",invalidContact:"Check contact name, phone and title, with one primary contact.",
  invalidAddress:"Check the delivery point label, recipient, phone and address.",
  invalidApplication:"Add at least one primary contact, one delivery point and the BR file.",
  brExpired:"This BR is expired and cannot be submitted under the current policy.",
  locked:"This application is under review and cannot be edited.",alreadyApproved:"This account already has an approved company application.",
  membershipExists:"This account already belongs to a company.",operationFailed:"The application was not saved. Check the details and retry.",
  status:{draft:"Draft",pending_review:"Pending review",needs_info:"More information required",rejected:"Rejected",approved:"Approved"},
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalApplications: {
  description:"審核公司 BR 申請。批准時指定首位管理員及結算週期；申請人不會自動成為成員。",
  loading:"載入中…",accessDenied:"沒有客戶訂購營運權限。",operationFailed:"操作未完成，請重試。",
  userNotFound:"找不到已驗證電郵的使用者。",membershipConflict:"此使用者已屬於其他機構。",invalidEmail:"電郵格式無效。",
  invalidCycle:"請選擇結算週期。",invalidPolicy:"請填寫 1 至 365 日的提醒期、是否阻擋及原因。",
  invalidBr:"請核對 BR 號碼、有效期、原因及附件。",notPending:"這份申請目前不能審核。",
  policyTitle:"BR 到期政策",policyUnpublished:"尚未發布。未發布前，到期不會阻擋新單。",
  policyActive:"已發布：到期前 {{days}} 日提醒；到期後新單{{block}}。",
  blockYes:"會阻擋",blockNo:"不阻擋",reminderNotSent:"提醒日數只作政策紀錄，本頁不會發送電郵。",
  reminderDays:"提前提醒日數",blockOrders:"到期後阻擋新訂單",reason:"原因",publishPolicy:"發布政策",policyPublished:"已發布 BR 到期政策。",
  renewTitle:"公司 BR 續期",organization:"公司",chooseOrganization:"選擇公司",brNumber:"BR 號碼",expiresOn:"有效期",
  attachment:"BR 附件",renew:"記錄續期",renewed:"已保留新的 BR 版本。",
  company:"公司",applicant:"申請人",status:"狀態",review:"審核",empty:"目前沒有公司申請。",close:"關閉",
  openAttachment:"開啟附件（60 秒）",primary:"主要",adminEmail:"首位管理員電郵",cycle:"結算週期",
  cycleWeekly:"週結",cycleSemiMonthly:"半月結",cycleMonthly:"月結",
  approve:"批准並指定管理員",needsInfo:"要求補資料",reject:"拒絕",reviewed:"已記錄審核結果。",
  statusValue:{draft:"草稿",pending_review:"待審核",needs_info:"需補資料",rejected:"已拒絕",approved:"已批准"},
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalApplications: {
  description:"Review company BR applications. Approval assigns the first admin and a settlement cycle. The applicant is not added automatically.",
  loading:"Loading…",accessDenied:"You do not have customer ordering ops access.",operationFailed:"Could not complete the action. Please retry.",
  userNotFound:"No verified user has that email.",membershipConflict:"That user already belongs to another organization.",invalidEmail:"Enter a valid email.",
  invalidCycle:"Choose a settlement cycle.",invalidPolicy:"Enter a reminder of 1–365 days, the block choice and a reason.",
  invalidBr:"Check the BR number, expiry, reason and file.",notPending:"This application cannot be reviewed in its current state.",
  policyTitle:"BR expiry policy",policyUnpublished:"Not published. Expired registrations do not block new orders until a policy is published.",
  policyActive:"Published: remind {{days}} days before expiry; new orders are {{block}} after expiry.",
  blockYes:"blocked",blockNo:"not blocked",reminderNotSent:"The reminder lead time is stored only. This page does not send email.",
  reminderDays:"Reminder lead days",blockOrders:"Block new orders after expiry",reason:"Reason",publishPolicy:"Publish policy",policyPublished:"BR expiry policy published.",
  renewTitle:"Renew a company BR",organization:"Company",chooseOrganization:"Choose a company",brNumber:"BR number",expiresOn:"Expiry",
  attachment:"BR file",renew:"Record renewal",renewed:"A new BR version was kept.",
  company:"Company",applicant:"Applicant",status:"Status",review:"Review",empty:"No company applications yet.",close:"Close",
  openAttachment:"Open file (60 seconds)",primary:"Primary",adminEmail:"First admin email",cycle:"Settlement cycle",
  cycleWeekly:"Weekly",cycleSemiMonthly:"Twice a month",cycleMonthly:"Monthly",
  approve:"Approve and assign admin",needsInfo:"Request more information",reject:"Reject",reviewed:"Review recorded.",
  statusValue:{draft:"Draft",pending_review:"Pending review",needs_info:"More information required",rejected:"Rejected",approved:"Approved"},
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { lunchboxOps: {
  title:"互動飯盒", description:"用內部產品設定可售飯盒、價格、數量、送貨日及截單時間。客戶提交後進入報價單。",
  back:"返回客戶訂購營運", create:"新增飯盒餐單", edit:"編輯飯盒餐單", close:"關閉", save:"儲存", saved:"已儲存飯盒餐單。",
  operationFailed:"操作未完成，請重試。", invalidMenu:"請核對餐單名稱、品牌、送貨及截單。", invalidItems:"請核對產品、價格及數量。",
  empty:"尚未設定互動飯盒。", name:"餐單名稱", brand:"品牌", chooseBrand:"選擇品牌", delivery:"送貨", deliveryDate:"送貨日期", deliveryTime:"送貨時間", cutoff:"截單時間", fee:"運費",
  items:"餐點", product:"產品", chooseProduct:"選擇內部產品", price:"單價", stock:"可訂數量", addItem:"加入餐點", status:"狀態", active:"有效", inactive:"停用",
}}, true, true);
i18n.addResourceBundle("en", "translation", { lunchboxOps: {
  title:"Lunchboxes", description:"Publish internal products, prices, quantities, delivery dates and cutoffs. Customer submissions become quotes.",
  back:"Back to customer ordering ops", create:"New lunchbox menu", edit:"Edit lunchbox menu", close:"Close", save:"Save", saved:"Lunchbox menu saved.",
  operationFailed:"Could not complete the action. Please retry.", invalidMenu:"Check the menu name, brand, delivery and cutoff.", invalidItems:"Check each product, price and quantity.",
  empty:"No lunchbox menus yet.", name:"Menu name", brand:"Brand", chooseBrand:"Choose a brand", delivery:"Delivery", deliveryDate:"Delivery date", deliveryTime:"Delivery time", cutoff:"Cutoff", fee:"Delivery fee",
  items:"Items", product:"Product", chooseProduct:"Choose an internal product", price:"Unit price", stock:"Available quantity", addItem:"Add item", status:"Status", active:"Active", inactive:"Inactive",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalFeedback: {
  title:"訂單意見", intro:"訂單已完成。每張訂單只可留下一次意見，無需登入。登入後看到的是同一份意見。",
  comment:"你的意見", submit:"提交意見", submitting:"提交中…", loading:"正在載入訂單意見",
  unavailable:"暫時未能開啟這張訂單的意見。", alreadySubmitted:"這張訂單已提交過意見。", required:"請填寫意見。",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalFeedback: {
  title:"Order feedback", intro:"This order is complete. Each order accepts one comment. Sign-in is not required, and the same comment is visible after you sign in.",
  comment:"Your comment", submit:"Submit feedback", submitting:"Submitting…", loading:"Loading order feedback",
  unavailable:"This order feedback link is not available.", alreadySubmitted:"Feedback was already submitted for this order.", required:"Enter a comment.",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalCatalog: {
  title:"兌換", intro:"積分只可兌換實物或現金券，不能抵付訂單金額。兌換後由 FCCD 安排領取或發送。",
  gift:"實物", voucher:"現金券", points:"分", redeem:"兌換", soldOut:"已兌完", empty:"暫時沒有可兌換的項目。",
  loading:"正在載入兌換目錄", confirm:"用 {{points}} 分兌換{{name}}？這不會減少訂單應付金額。",
  insufficient:"積分不足。", unavailable:"這項目前不能兌換。", failed:"兌換未完成，請稍後再試。",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalCatalog: {
  title:"Redeem", intro:"Points can be exchanged for goods or cash vouchers. They do not reduce an order total. FCCD arranges collection or delivery after redemption.",
  gift:"Goods", voucher:"Cash voucher", points:"points", redeem:"Redeem", soldOut:"Out of stock", empty:"Nothing is available to redeem.",
  loading:"Loading rewards", confirm:"Redeem {{name}} for {{points}} points? This does not reduce an order total.",
  insufficient:"Not enough points.", unavailable:"This reward is not available.", failed:"Redemption could not be completed. Please retry.",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalRewardCatalog: {
  back:"返回客戶訂購營運", intro:"設定可用積分兌換的實物和現金券。兌換只扣積分，不抵訂單金額。",
  name:"名稱", kind:"類型", gift:"實物", voucher:"現金券", points:"所需積分", stock:"庫存", description:"說明", active:"上架",
  create:"新增兌換項目", save:"儲存", edit:"編輯", saved:"已儲存兌換項目。", items:"兌換目錄", empty:"尚未設定兌換項目。", inactive:"已下架",
  redemptions:"兌換紀錄", noRedemptions:"尚未有兌換。", pending:"待履約", fulfilled:"已履約", fulfill:"標記已履約",
  accessDenied:"沒有客戶訂購營運權限。", invalid:"請核對名稱、類型、積分和庫存。", notPending:"這筆兌換已不是待履約。", failed:"操作未完成，請重試。",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalRewardCatalog: {
  back:"Back to customer ordering ops", intro:"Publish goods and cash vouchers that customers redeem with points. Redemption deducts points and does not reduce an order total.",
  name:"Name", kind:"Type", gift:"Goods", voucher:"Cash voucher", points:"Points required", stock:"Stock", description:"Description", active:"Published",
  create:"Add reward", save:"Save", edit:"Edit", saved:"Reward saved.", items:"Catalog", empty:"No rewards yet.", inactive:"Hidden",
  redemptions:"Redemptions", noRedemptions:"No redemptions yet.", pending:"Pending", fulfilled:"Fulfilled", fulfill:"Mark fulfilled",
  accessDenied:"You do not have customer ordering ops access.", invalid:"Check the name, type, points and stock.", notPending:"This redemption is no longer pending.", failed:"The action could not be completed. Please retry.",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portalVoucher: {
  codes:"Shopify 現金券碼", queued:"正在建立折扣碼", issuing:"正在向 Shopify 發碼", issued:"可在 Shopify 結帳輸入", failed:"發碼未完成，請稍後再看",
  amount:"面額（HK$）", store:"Shopify 店舖", validDays:"有效天數", noStore:"不經 Shopify，由 FCCD 發送",
  linkTitle:"Shopify 客戶對應", linkIntro:"把 Portal 個人或企業連到店舖裡的既有客戶後，送貨地址才會雙向同步，現金券也會限定該客戶使用。",
  ownerType:"對象", user:"個人用戶", organization:"企業", ownerId:"用戶或企業 ID", customerId:"Shopify 客戶 ID", link:"儲存對應", linked:"已儲存 Shopify 客戶對應。",
}}, true, true);
i18n.addResourceBundle("en", "translation", { portalVoucher: {
  codes:"Shopify voucher codes", queued:"Creating the discount code", issuing:"Sending the code to Shopify", issued:"Enter this code at Shopify checkout", failed:"The code could not be created yet. Check again shortly.",
  amount:"Face value (HK$)", store:"Shopify store", validDays:"Valid days", noStore:"Manual voucher, not sent to Shopify",
  linkTitle:"Shopify customer link", linkIntro:"Link a personal or company account to an existing store customer before addresses sync both ways. Voucher codes are then limited to that customer.",
  ownerType:"Account", user:"Personal user", organization:"Company", ownerId:"User or company ID", customerId:"Shopify customer ID", link:"Save link", linked:"Shopify customer link saved.",
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portal: { switchOrganization: "切換企業" } }, true, true);
i18n.addResourceBundle("en", "translation", { portal: { switchOrganization: "Switch organization" } }, true, true);
i18n.addResourceBundle("zh-HK", "translation", { portal: {
  memberPermissions: "成員權限",
  memberPermissionsHint: "Admin 永遠擁有全部權限。以下只設定 Member 可以做的事，不會改變 FCCD 平台管理權。",
  permissionsSaved: "已更新成員權限。",
  permissions: {
    members: "成員管理", ordering: "訂餐管理", orders: "訂單查看", export: "訂單匯出",
    menus: "餐單管理", delivery: "送貨資料", points: "積分查看", redeem: "積分兌換", settings: "團隊設定",
  },
}}, true, true);
i18n.addResourceBundle("en", "translation", { portal: {
  memberPermissions: "Member permissions",
  memberPermissionsHint: "Admins always keep every permission. These switches apply to members only and do not change FCCD platform admin rights.",
  permissionsSaved: "Member permissions updated.",
  permissions: {
    members: "Manage members", ordering: "Place orders", orders: "View orders", export: "Export orders",
    menus: "Manage menus", delivery: "Delivery details", points: "View points", redeem: "Redeem points", settings: "Team settings",
  },
}}, true, true);
i18n.addResourceBundle("zh-HK", "translation", { lunchboxOps: {
  vipTitle: "VIP 訂飯週期", vipIntro: "把多日飯盒餐單放進同一個週期。週期截單後不能再批量下單，每一天仍是獨立報價單。",
  vipName: "週期名稱", vipSave: "發布週期", vipSaved: "已發布 VIP 訂飯週期。", vipInvalid: "請填週期名稱、截單時間，並至少選擇一日餐單。",
  vipDays: "{{count}} 日", failed: "操作未完成，請重試。",
}}, true, true);
i18n.addResourceBundle("en", "translation", { lunchboxOps: {
  vipTitle: "VIP lunch cycle", vipIntro: "Group several lunchbox days into one cycle. After the cycle cutoff, bulk ordering closes. Each day remains its own quote.",
  vipName: "Cycle name", vipSave: "Publish cycle", vipSaved: "VIP lunch cycle published.", vipInvalid: "Enter a cycle name, a cutoff and at least one day.",
  vipDays: "{{count}} days", failed: "The action could not be completed. Please retry.",
}}, true, true);
