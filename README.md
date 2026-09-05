# ReconcileAI — Auditable AI Finance Controller

**ReconcileAI** is an enterprise-grade AI Finance Controller built for automated financial settlement reconciliation, exception reasoning, human-in-the-loop resolution, and time-based forward cash forecasting.

---

## 🏛️ System Architecture

```
                               ┌────────────────────────────────┐
                               │   Internal Ledger CSV / Feed   │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │   Bank Settlement CSV / Feed   │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                               ┌────────────────────────────────┐
                               │     CSV Ingestion & Schema     │
                               │           Validator            │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   DETERMINISTIC FINANCIAL RECONCILIATION RULE ENGINE                   │
│                                (Source of Truth Engine)                                │
│                                                                                        │
│  1. EXACT_MATCH (1:1 Amount & Date Match)                                              │
│  2. GATEWAY_MDR_2_PERCENT (2.0% MDR Fee Deduction)                                     │
│  3. GATEWAY_MDR_PLUS_GST (2.0% Fee + 18% GST Tax Line Deduction)                       │
│  4. WEEKEND_SETTLEMENT (Friday -> Monday Business Day Calendar Rule)                   │
│  5. PENDING_BANK_SETTLEMENT (Ledger Charge Recorded, ₹0.00 Received in Bank Feed)     │
│  6. UNRESOLVED_VARIANCE (Unmatched Amount Discrepancy > Rule Tolerance)                │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SERVER-SIDE GOOGLE GEMINI AI CONTROLLER                         │
│                           (Reasoning & Explanation Layer)                              │
│                                                                                        │
│  • Generates human-readable evidence explanations                                      │
│  • Analyzes ambiguous exceptions & calculates risk severity (CRITICAL/HIGH/MEDIUM/LOW) │
│  • Provides AI operational controller insights & recommended next actions              │
│  • Responds to natural-language financial queries via ReconcileAI Assistant            │
│  • Falls back seamlessly to deterministic rule explanations when GEMINI_API_KEY is empty│
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    HUMAN CONTROLLER REVIEW & AUDIT LOG WORKFLOW                        │
│                                                                                        │
│  • Compact Priority Exceptions Table on Dashboard                                      │
│  • Transaction Evidence Drawer Modal with Component Score Alignment Breakdown           │
│  • Controller Actions: ACCEPT, OVERRIDE, RESOLVE, ESCALATE, REJECT                     │
│  • Full Audit Trail Logging with Reviewer Name, Action, Timestamp & Notes              │
└──────────────────────────────────────┬─────────────────────────────────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         TIME-BASED FORWARD CASH FORECASTING                            │
│                                                                                        │
│  • Pool A: Reconciled Cash Received (Confirmed Bank-Settled Funds)                     │
│  • Pool B: Projected Future Cash Settlements (Scheduled by Date after 2% Fee)          │
│  • Pool C: At-Risk Cash Exposure (Unresolved Controller Exceptions)                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Features & Capabilities

1. **Deterministic Financial Source of Truth**: Core matching, fee calculations (2% MDR, 18% GST), and monetary totals are 100% deterministic using integer paise math (`lib/financeUtils.ts`). LLMs never fabricate financial numbers.
2. **Server-Side Google Gemini AI Integration**:
   - Provider abstraction (`lib/ai/provider.ts` & `lib/ai/geminiProvider.ts`) powered by `GEMINI_API_KEY` and `GEMINI_MODEL`.
   - Server-side only. If `GEMINI_API_KEY` is not configured, the system falls back gracefully to deterministic rule explanations.
3. **Explicit Match Score / 100 Breakdown**: Score component alignment breakdown: Amount (100/100), Date (100/100), Reference (95/100), Rule (100/100) → **Match Score: 98.5 / 100**.
4. **True Business-Day Calendar Reasoning**: Business-day logic (`lib/dateUtils.ts`) distinguishing Friday → Monday settlement delays from weekday mismatches.
5. **Deterministic 65-Record Demo Benchmark**:
   - **65 Total Records**
   - **34 Exact 1:1 Matches**
   - **24 Rule / AI-Assisted Matches**
   - **7 Unresolved Controller Exceptions**
   - **89.2% Resolution Rate** (58/65) with ₹35,500 unresolved exposure and ₹19,860 identified fees/taxes.
6. **Reconciliation Run History & Delta Comparison ("What Changed?")**: Persistent run tracking (`RUN-0041` → `RUN-0042`) with resolution rate & exposure deltas.
7. **Time-Based Forward Cash Forecasting**: Projected settlement timeline separating Reconciled Cash Received, Projected Settlements by Date (Today, Tomorrow, Friday, Monday...), and At-Risk Exposure.
8. **Actionable Controller Exception Workflow**: Severity indicators (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), compact exception table, Evidence Drawer modal, and manual review logging (`ACCEPT`, `OVERRIDE`, `RESOLVE`, `ESCALATE`).

---

## 🛠️ Environment Setup & Configuration

Create `.env.local` in the project root:

```env
# Google Gemini AI Provider (Required for LLM Reasoning & AI Assistant)
GEMINI_API_KEY="your-google-gemini-api-key"
GEMINI_MODEL="gemini-1.5-flash"

# Cloud Firestore Audit Persistence (Optional - Graceful Fallback to Local Audit Store)
FIREBASE_PROJECT_ID="reconcile-ai-dev"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@reconcile-ai.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY=""
```

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run unit test suite (verifies 65-record benchmark & paise math)
cmd /c npx tsx lib/__tests__/reconciliation.test.ts

# 3. Start development server
cmd /c npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Running Automated Tests

```bash
cmd /c npx tsx lib/__tests__/reconciliation.test.ts
```

Output:
```
=== STARTING RECONCILEAI UNIT & RECONCILIATION BENCHMARK TESTS ===
✓ PASS: Demo Dataset contains exactly 65 records
✓ PASS: Engine processed 65 total records
✓ PASS: Engine identified exactly 34 Exact 1:1 matches
✓ PASS: Engine identified exactly 24 Rule/AI resolved matches
✓ PASS: Engine identified exactly 7 Unresolved Exceptions
✓ PASS: Totals reconcile mathematically: 34 + 24 + 7 = 65
✓ PASS: Overall resolution rate equals 89.2%
✓ PASS: 2% MDR fee of ₹10,000 equals ₹200.00
✓ PASS: 18% GST on ₹200 MDR fee equals ₹36.00
✓ PASS: Net bank settlement after MDR+GST equals ₹9,764.00
✓ PASS: Friday -> Monday delay recognized as legitimate weekend settlement
✓ PASS: Business days between Friday and Monday equals 1 day
✓ PASS: Tuesday -> Thursday delay is NOT misclassified as weekend settlement
✓ PASS: 2% MDR rule correctly triggered
✓ PASS: Calculated MDR fee equals ₹1,000.00
✓ PASS: Match score is 98 or higher

=== BENCHMARK SUMMARY: 16 PASSED, 0 FAILED ===
```
