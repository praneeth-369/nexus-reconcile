import * as admin from 'firebase-admin';

export interface MathJourney {
  ledgerGrossRupees: number;
  mdrRatePct: number;
  mdrRupees: number;
  gstRatePct: number;
  gstRupees: number;
  netExpectedRupees: number;
  actualBankRupees: number;
  varianceRupees: number;
  formulaString: string;
}

export interface CandidateEvaluation {
  candidateId: string;
  bankAmount: number;
  bankDate: string;
  referenceSimilarityPct: number;
  settlementDelayDays: number;
  isPlausible: boolean;
  evaluationOutcome: 'SELECTED' | 'COLLISION_AMBIGUOUS' | 'AMOUNT_MISMATCH' | 'DATE_EXCEEDED';
  reason: string;
}

export interface PolicyAuthorization {
  policyRule: string;
  policyLabel: string;
  decision: 'AUTHORIZED' | 'REFUSED_FAIL_CLOSED';
  refusalReason?: string;
  authorizedBy: 'DETERMINISTIC_POLICY_ENGINE';
  aiConfidenceScore: number;
  timestamp: string;
}

export interface AuditRecord {
  id: string;
  txn_id: string;
  internal_amount: number;
  bank_amount: number;
  internal_date: string;
  bank_date: string;
  payment_method: string;
  status: 'EXACT_MATCH' | 'RESOLVED_BY_AGENT' | 'FLAGGED_EXCEPTION' | 'HUMAN_RESOLVED' | 'HUMAN_MATCHED' | 'HUMAN_UNMATCHED' | 'ESCALATED_TO_OPS';
  match_type: 'EXACT_1TO1' | 'MDR_FEE_2PCT' | 'MDR_2PCT_WITH_GST_18PCT' | 'WEEKEND_DATE_SLIP' | 'UNRESOLVED_DISCREPANCY';
  explanation: string;
  confidence_score: number;
  difference_amount: number;
  timestamp: string;
  mathJourney?: MathJourney;
  candidatesEvaluated?: CandidateEvaluation[];
  policyAuth?: PolicyAuthorization;
  razorpay_event?: 'payment.captured' | 'settlement.processed' | 'refund.processed';
  razorpay_payment_id?: string;
  razorpay_settlement_id?: string;
  urgency_category?: 'CRITICAL' | 'ATTENTION_REQUIRED' | 'HEALTHY';
}

// In-Memory Fallback Store for local development when Firebase Admin key is not configured
class LocalAuditStore {
  private static instance: LocalAuditStore;
  private records: AuditRecord[] = [];

  private constructor() {}

  public static getInstance(): LocalAuditStore {
    if (!LocalAuditStore.instance) {
      LocalAuditStore.instance = new LocalAuditStore();
    }
    return LocalAuditStore.instance;
  }

  public saveBatch(records: AuditRecord[]): void {
    this.records = [...records];
  }

  public getRecords(): AuditRecord[] {
    return this.records;
  }

  public clear(): void {
    this.records = [];
  }
}

export const localAuditStore = LocalAuditStore.getInstance();

let db: admin.firestore.Firestore | null = null;

try {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      db = admin.firestore();
      console.log('[FirebaseAdmin] Successfully initialized Cloud Firestore.');
    } else {
      console.warn('[FirebaseAdmin] Credentials incomplete. Falling back to high-performance local audit store.');
    }
  } else {
    db = admin.firestore();
  }
} catch (error) {
  console.warn('[FirebaseAdmin] Initialization warning, using local audit fallback:', error);
  db = null;
}

export async function persistAuditRecords(records: AuditRecord[]): Promise<boolean> {
  // Always update in-memory store for instantaneous local queries
  localAuditStore.saveBatch(records);

  if (!db) {
    return true;
  }

  try {
    const batch = db.batch();
    const collectionRef = db.collection('reconciliation_audits');

    records.forEach((rec) => {
      const docRef = collectionRef.doc(rec.txn_id);
      batch.set(docRef, { ...rec, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error('[FirebaseAdmin] Error committing batch to Firestore:', err);
    return false;
  }
}

export async function fetchAuditRecords(): Promise<AuditRecord[]> {
  if (!db) {
    return localAuditStore.getRecords();
  }

  try {
    const snapshot = await db.collection('reconciliation_audits').get();
    if (snapshot.empty) {
      return localAuditStore.getRecords();
    }
    const results: AuditRecord[] = [];
    snapshot.forEach((doc) => {
      results.push(doc.data() as AuditRecord);
    });
    return results;
  } catch (err) {
    console.error('[FirebaseAdmin] Error fetching records from Firestore:', err);
    return localAuditStore.getRecords();
  }
}
