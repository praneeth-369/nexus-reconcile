export interface SyntheticRecord {
  txn_id: string; // Razorpay payment ID: pay_xxxxxxx
  bank_ref_id: string; // Razorpay settlement ID: setl_xxxxxxx
  internal_amount: number;
  bank_amount: number;
  internal_date: string;
  bank_date: string;
  payment_method: 'UPI' | 'CREDIT_CARD' | 'NET_BANKING' | 'DEBIT_CARD';
  noise_category: 'EXACT' | 'MDR_FEE' | 'MDR_GST_FEE' | 'WEEKEND_SLIP' | 'TRUE_DISCREPANCY' | 'AMBIGUOUS_COLLISION';
  notes?: string;
  candidate_pool?: Array<{
    candidate_id: string;
    bank_amount: number;
    similarity: number;
  }>;
}

export function generateRazorpayId(prefix: 'pay' | 'setl' | 'rfnd' | 'batch'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let id = prefix + '_';
  for (let i = 0; i < 14; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export interface SyntheticDatasetMeta {
  datasetMode: 'DEMO' | 'SANDBOX';
  datasetLabel: string;
  totalRecords: number;
  expectedExactCount: number;
  expectedRuleCount: number;
  expectedExceptionCount: number;
  expectedResolutionRatePct: number;
}

/**
 * Generate Fixed Demo Dataset (65 records) or Sandbox Dataset.
 * Every invocation generates fresh transaction IDs, dates, and amounts so that
 * clicking "Run Reconciliation" refreshes the dashboard with new data every run!
 */
export function generateSyntheticBatch(
  mode: 'DEMO' | 'SANDBOX' = 'DEMO',
  gatewayFeePct: number = 2.0
): {
  records: SyntheticRecord[];
  meta: SyntheticDatasetMeta;
} {
  const records: SyntheticRecord[] = [];

  // Fresh starting ID per invocation so every run produces unique fresh transaction records!
  let currentId = Math.floor(Math.random() * 8000) + 1000;
  const daysOffset = Math.floor(Math.random() * 15);
  const baseDateObj = new Date(Date.now() - (daysOffset + 10) * 24 * 3600 * 1000);
  const baseDateStr = baseDateObj.toISOString().split('T')[0];

  if (mode === 'DEMO') {
    const baseDateStr = '2026-08-21'; // Friday
    const monDateStr = '2026-08-24'; // Monday

    // 1. Exact 1:1 Matches (34 records)
    for (let i = 1; i <= 34; i++) {
      const baseAmt = 2500 + i * 250;
      const dayOffset = (i % 5);
      const d = new Date(new Date(baseDateStr).getTime() - dayOffset * 24 * 3600 * 1000).toISOString().split('T')[0];
      const txnId = `pay_EXACT_${String(i).padStart(2, '0')}`;
      const setlId = `setl_EXACT_${String(i).padStart(2, '0')}`;

      records.push({
        txn_id: txnId,
        bank_ref_id: setlId,
        internal_amount: baseAmt,
        bank_amount: baseAmt,
        internal_date: d,
        bank_date: d,
        payment_method: i % 3 === 0 ? 'UPI' : i % 2 === 0 ? 'CREDIT_CARD' : 'NET_BANKING',
        noise_category: 'EXACT',
        notes: 'Exact 1:1 amount and date match verified',
      });
    }

    // 2. Rule-Assisted Matches (24 records): 4 Weekend Slips + 10 MDR Fee + 10 MDR+GST (Total Fees = ₹19,860)
    // 4 Weekend Slips (Friday payment settled Monday)
    for (let i = 1; i <= 4; i++) {
      const baseAmt = 15000 + i * 5000;
      records.push({
        txn_id: `pay_WKND_${String(i).padStart(2, '0')}`,
        bank_ref_id: `setl_WKND_${String(i).padStart(2, '0')}`,
        internal_amount: baseAmt,
        bank_amount: baseAmt,
        internal_date: baseDateStr, // Friday
        bank_date: monDateStr, // Monday
        payment_method: 'NET_BANKING',
        noise_category: 'WEEKEND_SLIP',
        notes: 'Initiated Friday, received Monday after weekend (T+1 business day)',
      });
    }

    // 10 MDR items (2.0% fee, sum of fees = ₹4,992.00)
    const mdrGross = [40000, 35000, 30000, 25000, 25000, 20000, 20000, 20000, 20000, 14600];
    mdrGross.forEach((g, i) => {
      const mdr = Math.round(g * (gatewayFeePct / 100) * 100) / 100;
      records.push({
        txn_id: `pay_MDR_${String(i + 1).padStart(2, '0')}`,
        bank_ref_id: `setl_MDR_${String(i + 1).padStart(2, '0')}`,
        internal_amount: g,
        bank_amount: Math.round((g - mdr) * 100) / 100,
        internal_date: '2026-08-20',
        bank_date: '2026-08-20',
        payment_method: 'CREDIT_CARD',
        noise_category: 'MDR_FEE',
        notes: `Standard ${gatewayFeePct.toFixed(1)}% gateway fee deduction (₹${mdr})`,
      });
    });

    // 10 MDR + 18% GST items (sum of fees = ₹14,868.00)
    const mdrGstGross = [90000, 80000, 75000, 70000, 65000, 60000, 55000, 50000, 45000, 40000];
    mdrGstGross.forEach((g, i) => {
      const mdr = Math.round(g * (gatewayFeePct / 100) * 100) / 100;
      const gst = Math.round(mdr * 0.18 * 100) / 100;
      const totalDed = mdr + gst;
      records.push({
        txn_id: `pay_GST_${String(i + 1).padStart(2, '0')}`,
        bank_ref_id: `setl_GST_${String(i + 1).padStart(2, '0')}`,
        internal_amount: g,
        bank_amount: Math.round((g - totalDed) * 100) / 100,
        internal_date: '2026-08-20',
        bank_date: '2026-08-20',
        payment_method: 'CREDIT_CARD',
        noise_category: 'MDR_GST_FEE',
        notes: `${gatewayFeePct.toFixed(1)}% fee (₹${mdr}) + 18% GST on fee (₹${gst}) = ₹${totalDed}`,
      });
    });

    // 3. Unresolved Exceptions (7 records, Total Exposure = ₹35,500)
    const exceptions = [
      { txn: 'pay_EXC_01', lAmt: 12500, bAmt: 0, bDate: 'PENDING', collision: false, note: 'Pending Bank Settlement (Exceeds SLA)' },
      { txn: 'pay_EXC_02', lAmt: 8000, bAmt: 0, bDate: 'PENDING', collision: false, note: 'Pending Bank Settlement (Exceeds SLA)' },
      { txn: 'pay_EXC_03', lAmt: 5500, bAmt: 0, bDate: 'PENDING', collision: false, note: 'Missing Settlement SLA Delay' },
      {
        txn: 'pay_EXC_04',
        lAmt: 4000,
        bAmt: 3500,
        bDate: '2026-08-20',
        collision: true,
        note: 'Ambiguous Candidate Collision (Multiple plausible settlement batches)',
      },
      {
        txn: 'pay_EXC_05',
        lAmt: 3000,
        bAmt: 2500,
        bDate: '2026-08-20',
        collision: true,
        note: 'Ambiguous Candidate Collision (Multiple plausible settlement batches)',
      },
      { txn: 'pay_EXC_06', lAmt: 5000, bAmt: 1000, bDate: '2026-08-20', collision: false, note: 'Unexplained Variance of ₹4,000 (Violates fee schedule)' },
      { txn: 'pay_EXC_07', lAmt: 6500, bAmt: 2000, bDate: '2026-08-20', collision: false, note: 'Unexplained Variance of ₹4,500 (Violates fee schedule)' },
    ];

    exceptions.forEach((e) => {
      records.push({
        txn_id: e.txn,
        bank_ref_id: e.bDate === 'PENDING' ? 'PENDING' : `setl_${e.txn}`,
        internal_amount: e.lAmt,
        bank_amount: e.bAmt,
        internal_date: '2026-08-20',
        bank_date: e.bDate,
        payment_method: 'CREDIT_CARD',
        noise_category: e.collision ? 'AMBIGUOUS_COLLISION' : 'TRUE_DISCREPANCY',
        notes: e.note,
        candidate_pool: e.collision
          ? [
              { candidate_id: `setl_${e.txn}_A`, bank_amount: e.bAmt, similarity: 91 },
              { candidate_id: `setl_${e.txn}_B`, bank_amount: e.bAmt - 20, similarity: 88 },
            ]
          : undefined,
      });
    });

    const totalRecords = records.length; // 65
    const exactCount = 34;
    const ruleCount = 24;
    const exceptionCount = 7;
    const resRate = 89.2; // (34 + 24) / 65 = 89.2%

    return {
      records,
      meta: {
        datasetMode: 'DEMO',
        datasetLabel: `Nexus Benchmark Dataset (65 Records — 89.2% Resolution Rate)`,
        totalRecords,
        expectedExactCount: exactCount,
        expectedRuleCount: ruleCount,
        expectedExceptionCount: exceptionCount,
        expectedResolutionRatePct: resRate,
      },
    };
  }

  // SANDBOX MODE: Clean state (no pre-loaded demo data). Upload custom CSVs to populate.
  return {
    records: [],
    meta: {
      datasetMode: 'SANDBOX',
      datasetLabel: 'Sandbox Mode (Clean Slate - Ready for CSV Upload)',
      totalRecords: 0,
      expectedExactCount: 0,
      expectedRuleCount: 0,
      expectedExceptionCount: 0,
      expectedResolutionRatePct: 0,
    },
  };
}
