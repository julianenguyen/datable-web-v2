export const CONSENT_TEXT_VERSION = '2025-06-01'

export type ConsentProgram = 'bhi' | 'ccm' | 'rtm' | 'cocm'

const PROGRAM_DESCRIPTIONS: Record<ConsentProgram, string> = {
  bhi: `Behavioral Health Integration (BHI) — CPT Code 99484
Your provider will spend at least 20 minutes per calendar month managing your behavioral health care. This includes reviewing your between-session check-in data, updating your care plan, and coordinating your treatment. Medicare Part B will be billed monthly for this service. You may owe a coinsurance of approximately $10–$12 per month if you have Medicare without supplemental coverage. Patients with Medigap or supplemental insurance typically owe $0.`,

  ccm: `Chronic Care Management (CCM) — CPT Codes 99490, 99439
Your provider will spend at least 20 minutes per calendar month managing two or more of your chronic health conditions. This includes reviewing your check-in data, maintaining a written care plan, and coordinating your care across providers. Medicare Part B will be billed monthly for this service. You may owe a coinsurance of approximately $12–$15 per month if you have Medicare without supplemental coverage.`,

  rtm: `Remote Therapeutic Monitoring (RTM) — CPT Codes 98978, 98980
Your provider will supply you with a digital monitoring tool (the Datable app) that collects and transmits your behavioral health and therapy adherence data. Your provider will review this data and spend at least 20 minutes per month on treatment management. This requires that you submit data on at least 16 days within each 30-day billing period. Medicare Part B will be billed monthly for this service. You may owe a coinsurance of approximately $10–$15 per month if you have Medicare without supplemental coverage.`,

  cocm: `Collaborative Care Management (CoCM) — CPT Codes 99492, 99493
Your care will be managed by a team that includes your therapist, a behavioral health care manager, and a psychiatric consultant. Your care team will spend at least 60–70 minutes per calendar month on your care management, including assessments, care plan updates, and team consultations. Medicare Part B will be billed monthly for this service. You may owe a coinsurance of approximately $27–$33 per month if you have Medicare without supplemental coverage.`,
}

export function generateConsentText(programs: ConsentProgram[]): string {
  const programSections = programs
    .map((p) => PROGRAM_DESCRIPTIONS[p])
    .join('\n\n')

  return `CARE MANAGEMENT ENROLLMENT CONSENT

By signing below, you agree to enroll in the following care management program(s) provided by your therapist through Datable Health:

${programSections}

IMPORTANT INFORMATION FOR ALL PROGRAMS:

Billing: Your insurance (Medicare, Medicaid, or private insurance) will be billed monthly for these services. Your actual cost-share depends on your specific insurance plan and coverage.

Your Rights: You may disenroll from any of these programs at any time by notifying your provider. Disenrollment takes effect at the end of the current calendar month. Only one provider may bill for these services per patient per month.

Data Use: Your between-session check-in data, mood logs, and care plan information will be used to support the clinical services described above and to generate the documentation required for billing. This data is protected under HIPAA and governed by Datable Health's Business Associate Agreement with your provider.

By typing your full legal name below and submitting this form, you confirm that:
1. You have read and understood the program descriptions above.
2. You consent to enrollment in the listed program(s).
3. You understand that your insurance will be billed monthly.
4. You understand your estimated cost-share responsibility.
5. You understand you may disenroll at any time.

Consent Text Version: ${CONSENT_TEXT_VERSION}`
}
