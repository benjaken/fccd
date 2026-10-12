# Customer portal visual QA

final result: passed

## Sources and scope

- Login style: `C:/Users/user/AppData/Local/Temp/codex-clipboard-49897f2a-921f-4ef7-8665-49858db0003c.png`.
- Later login adjustment: `C:/Users/user/AppData/Local/Temp/codex-clipboard-6880eb83-6d4b-4e74-8d28-36880c7adf2c.png`; user requested logo and two title lines in a horizontal row.
- Workspace error state: `C:/Users/user/AppData/Local/Temp/codex-clipboard-e3278672-661f-4134-b31a-ff6b74de485a.png`; user requested improved presentation using the existing Food Channel logo.
- Functional override: user explicitly requested email OTP for both personal and organization customers. The reference's phone/password inputs and blue text-selection highlights are not recreation targets.

## Rendered evidence

- Actual login route: `http://127.0.0.1:4173/customer?mode=personal`.
- Login desktop: `artifacts/customer-login/personal-horizontal.png`, 705 × 721 CSS/pixels, density 1.
- Organization login desktop: `artifacts/customer-login/organization-horizontal.png`, 705 × 721 CSS/pixels, density 1.
- Organization login mobile: `artifacts/customer-login/organization-mobile.png`, 393 × 852 CSS/pixels, density 1.
- Workspace desktop: `artifacts/customer-login/workspace-desktop.png`, 1367 × 919 CSS/pixels, density 1.
- Workspace mobile: `artifacts/customer-login/workspace-mobile.png`, 393 × 852 CSS/pixels, density 1.
- Full comparisons: `artifacts/customer-login/comparison-login.png` and `artifacts/customer-login/comparison-workspace.png`, original-resolution images placed side by side. No density normalization was needed. The workspace reference includes a browser scrollbar; the implementation does not need one at this viewport.
- Focused review: branding, mode links, form labels, status copy and buttons were legible in the full original-resolution captures; the separate mobile workspace capture also provided a close view of these regions. No additional crop was necessary.

Workspace screenshots use a temporary, browser-rendered fixture importing the actual `CustomerWorkspaceHeader` and `CustomerPortalAccessState` components, with a synthetic error message and no authentication/customer data. This verifies presentation, not a real authenticated backend connection. The fixture was removed after capture. Integration tests cover the actual page's single selector, real logo, access failure and successful retry.

## Comparison history

1. Initial login render used the requested light background, supplied SVG and isolated form card. The subsequent user request superseded the vertical header; logo and titles were placed in one horizontal row, then recaptured at desktop and mobile sizes.
2. The supplied workspace screenshot showed two identity selectors, an FCCD text wordmark and a floating error/retry area. These P2 presentation issues were resolved with one selector, the existing Food Channels Catering SVG and an accessible, centered status card. The revised desktop/mobile captures were compared side by side with the source.

## Required surfaces and result

- Typography: readable Chinese labels, consistent title hierarchy and responsive header sizes. OTP copy intentionally reflects the confirmed new login method.
- Spacing: uniform page padding, aligned header, one identity bar and coherent error card spacing; login uses a 480px form area.
- Colors: reference's light green background and green actions; muted explanatory text rather than a full red error line. Dark login uses existing theme tokens.
- Images: repository SVG logo is crisp, proportional and reused in both login and workspace headers.
- Content: original error meaning, retry, logout and identity switching retained. No customer price, receipt or add-on detail changes are implied by the visual work.
- Responsive behavior: mobile workspace has `scrollWidth = viewportWidth = 393`; no horizontal clipping. Branding, mode switch, logout and retry remain visible.
- Interactions: browser-tested personal/organization navigation and selected mode. Automated tests cover OTP sending/verification errors, resend, change email, verified personal sessions, empty order accounts, context isolation, retry and existing detail flows.
- Browser console: no error-level messages in the captured login/workspace views. No real OTP email was sent during QA.

No actionable P0/P1/P2 visual issue remains within this scoped change. Real hosted OTP delivery/configuration and authenticated integration remain deployment validation tasks; this is not acceptance of every v1.8 PRD feature. No P3 polish is required for the requested presentation.

## Latest header positioning adjustment

Source: `C:/Users/user/AppData/Local/Temp/codex-clipboard-8d60ab78-46d8-40ba-91c2-9ed4fcdd3ab2.png`. The user explicitly moved identity switching to the top right beside logout. The implementation now places the existing mode links inside the header actions, removes the separate identity row, and retains one selector. Browser captures: `artifacts/customer-login/workspace-top-right.png` (1349 × 900, density 1) and `workspace-top-right-mobile.png` (393 × 852, density 1). The desktop capture visibly places the control at the arrow's requested destination; the mobile action row wraps and remains right aligned, with scroll width equal to viewport width (393). Logo, status card and action behavior are preserved. TypeScript and 24 existing integration tests passed after the adjustment. No P0/P1/P2 finding; final result: passed.
