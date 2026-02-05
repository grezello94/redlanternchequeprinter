import { useState, useEffect } from 'react';
import { db, repairIndexedDbPersistence } from './firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where, startAt, endAt, startAfter, writeBatch, onSnapshot } from 'firebase/firestore';
import type { ChequeData } from './types';
// print components are not directly imported here; we use print container markup

export default function App() {
  const [data, setData] = useState<ChequeData>({
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, ''),
    payTo: '',
    amountInWords: '',
    amountInNumbers: '',
    accountNumber: '04940200000360',
    branch: 'COLVA BRANCH, COLVA-403704',
    ifscCode: 'BARBOCOLVAX',
    payeeName: 'FOR RED LANTERN RESTAURANT',
    chequeNo: '',
    hidePayee: false
  });

  const [payees, setPayees] = useState<string[]>([]);
  const [payeesLoaded, setPayeesLoaded] = useState(false);
  const [payeesError, setPayeesError] = useState<string | null>(null);
  const [payeesReloadKey, setPayeesReloadKey] = useState(0);
  const [filteredPayees, setFilteredPayees] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentCheques, setRecentCheques] = useState<Array<{ chequeNo?: string; amount?: string; date?: string; payTo?: string; issuedDay?: string; issuedAt?: string }>>([]);
  const [lastPrinted, setLastPrinted] = useState<ChequeData | null>(null);
  const [lastPrintedAt, setLastPrintedAt] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<Array<{ key: string; chequeNo?: string; amount?: string; date?: string; payTo?: string; issuedDay?: string; issuedAt?: string }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadedAll, setHistoryLoadedAll] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLastDoc, setHistoryLastDoc] = useState<any>(null);
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFromInput, setHistoryFromInput] = useState('');
  const [historyToInput, setHistoryToInput] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [lastSavedRecord, setLastSavedRecord] = useState<{ payTo: string; amountInNumbers: string; date: string; chequeNo: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [printingToast, setPrintingToast] = useState<string | null>(null);
  const [pendingQueue, setPendingQueue] = useState<Array<any>>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminDocs, setAdminDocs] = useState<Array<any>>([]);
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; msg?: string } | null>(null);
  const [showPrintSetup, setShowPrintSetup] = useState(false);
  const [systemToast, setSystemToast] = useState<string | null>(null);
  const PAYEES_CACHE_KEY = 'rl_payees_cache_v1';
  const PAYEES_MIGRATION_KEY = 'rl_payees_migrated_nameLower_v1';
  const PAYEES_PAGE_SIZE = 500;
  const CHEQUES_MIGRATION_KEY = 'rl_cheques_migrated_payToLower_v1';
  const CHEQUES_PAGE_SIZE = 500;
  const HISTORY_PAGE_SIZE = 200;
  const [livePayeeMatches, setLivePayeeMatches] = useState<string[]>([]);
  const [livePayeesLoading, setLivePayeesLoading] = useState(false);

  const normalizePayee = (value: string) =>
    (value || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const findExistingPayee = (name: string) => {
    const norm = normalizePayee(name);
    if (!norm) return null;
    return payees.find(p => normalizePayee(p) === norm) || null;
  };

  const mergePayees = (...lists: string[][]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
      for (const p of list) {
        const key = normalizePayee(p);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    }
    return out;
  };

  const storedDateToISO = (stored: string) => {
    if (!stored || stored.length !== 8) return '';
    const dd = stored.slice(0,2); const mm = stored.slice(2,4); const yyyy = stored.slice(4);
    return `${yyyy}-${mm}-${dd}`;
  };

  const storedDateToISOWithTime = (stored: string) => {
    if (!stored || stored.length !== 8) return '';
    const dd = parseInt(stored.slice(0,2), 10);
    const mm = parseInt(stored.slice(2,4), 10);
    const yyyy = parseInt(stored.slice(4), 10);
    if (!dd || !mm || !yyyy) return '';
    const d = new Date(yyyy, mm - 1, dd);
    return d.toISOString();
  };

  const storedDateToDay = (stored: string) => {
    if (!stored || stored.length !== 8) return '';
    const dd = parseInt(stored.slice(0,2), 10);
    const mm = parseInt(stored.slice(2,4), 10);
    const yyyy = parseInt(stored.slice(4), 10);
    if (!dd || !mm || !yyyy) return '';
    const d = new Date(yyyy, mm - 1, dd);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return days[d.getDay()] || '';
  };

  const isoToDay = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return days[d.getDay()] || '';
  };

  const isoToDisplay = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${dd}/${mm}/${yyyy} ${hours}:${mins} ${ampm}`;
  };

  const issuedIsoToDateOnly = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };

  const timestampToIso = (ts: any) => {
    if (!ts) return '';
    try {
      if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
    } catch { /* no-op */ }
    return '';
  };

  const historyKey = (r: { payTo?: string; chequeNo?: string; date?: string; amount?: string; issuedAt?: string }) =>
    `${normalizePayee(r.payTo || '')}|${(r.chequeNo || '').trim()}|${(r.date || '').trim()}|${(r.amount || '').trim()}|${(r.issuedAt || '').trim()}`;

  const mergeHistory = (current: Array<{ key: string }>, incoming: Array<{ key: string }>) => {
    const seen = new Set(current.map(r => r.key));
    const out = [...current];
    for (const item of incoming) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
    }
    return out;
  };

  const mapRecentCheques = (docs: any[]) =>
    docs.map(d => ({
      chequeNo: d.data().chequeNo as string,
      amount: d.data().amountInNumbers as string,
      date: d.data().date as string,
      payTo: d.data().payTo as string,
      issuedDay: (d.data().issuedDay as string) || storedDateToDay(d.data().date as string),
    }));

  const mapHistoryDocs = (docs: any[]) =>
    docs.map(d => {
      const data = d.data() || {};
      const createdIso = timestampToIso(data.createdAt);
      const issuedAt = (data.issuedAt as string) || createdIso || storedDateToISOWithTime(data.date as string);
      const rec = {
        payTo: data.payTo as string,
        chequeNo: data.chequeNo as string,
        amount: data.amountInNumbers as string,
        date: data.date as string,
        issuedAt,
        issuedDay: (data.issuedDay as string) || isoToDay(issuedAt) || storedDateToDay(data.date as string),
      };
      return { key: historyKey(rec), ...rec };
    });

  const loadRecentForPayee = async (payee: string) => {
    const p = (payee || '').trim();
    if (!p) { setRecentCheques([]); return; }
    const norm = normalizePayee(p);
    const runQuery = async (field: 'payToLower' | 'payTo', value: string) => {
      const snap = await withIndexedDbRetry(async () => {
        const q = query(
          collection(db, 'cheques'),
          where(field, '==', value),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        return await getDocs(q);
      });
      return snap;
    };

    let snap: any = null;
    try {
      if (norm) snap = await runQuery('payToLower', norm);
    } catch (e) {
      console.warn('payToLower recent lookup failed, falling back', e);
    }

    try {
      if (!snap || snap.empty) snap = await runQuery('payTo', p);
      setRecentCheques(mapRecentCheques(snap.docs));
    } catch (e) {
      console.error('Failed to load recent cheques', e);
      setRecentCheques([]);
    }
  };

  const migratePayeesNameLower = async (docs: any[]) => {
    try {
      const done = localStorage.getItem(PAYEES_MIGRATION_KEY);
      if (done === '1') return;
    } catch { /* no-op */ }
    const updates: Array<{ ref: any; nameLower: string }> = [];
    for (const d of docs) {
      const data = d.data?.() || {};
      const name = (data.name as string || '').trim();
      const desired = normalizePayee(name);
      if (!desired) continue;
      const existing = (data.nameLower as string || '').trim();
      if (existing !== desired) updates.push({ ref: d.ref, nameLower: desired });
    }
    if (!updates.length) {
      try { localStorage.setItem(PAYEES_MIGRATION_KEY, '1'); } catch { /* no-op */ }
      return;
    }
    const BATCH_LIMIT = 400;
    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const u of updates.slice(i, i + BATCH_LIMIT)) {
        batch.update(u.ref, { nameLower: u.nameLower });
      }
      await batch.commit();
    }
    try { localStorage.setItem(PAYEES_MIGRATION_KEY, '1'); } catch { /* no-op */ }
  };

  const migrateChequesPayToLower = async () => {
    try {
      const done = localStorage.getItem(CHEQUES_MIGRATION_KEY);
      if (done === '1') return;
    } catch { /* no-op */ }
    try {
      let last: any = null;
      while (true) {
        const snap = await withIndexedDbRetry(async () => {
          const q = last
            ? query(collection(db, 'cheques'), orderBy('payTo', 'asc'), startAfter(last), limit(CHEQUES_PAGE_SIZE))
            : query(collection(db, 'cheques'), orderBy('payTo', 'asc'), limit(CHEQUES_PAGE_SIZE));
          return await getDocs(q);
        });
        if (snap.empty) break;
        const updates: Array<{ ref: any; data: any }> = [];
        for (const d of snap.docs) {
          const data = d.data() || {};
          const name = (data.payTo as string || '').trim();
          const desired = normalizePayee(name);
          if (!desired) continue;
          const existing = (data.payToLower as string || '').trim();
          const patch: any = {};
          if (existing !== desired) patch.payToLower = desired;
          const createdIso = timestampToIso(data.createdAt);
          const issuedAt = (data.issuedAt as string) || createdIso || storedDateToISOWithTime(data.date as string);
          if (!data.issuedAt && issuedAt) patch.issuedAt = issuedAt;
          const issuedDay = (data.issuedDay as string) || isoToDay(issuedAt) || storedDateToDay(data.date as string);
          if (!data.issuedDay && issuedDay) patch.issuedDay = issuedDay;
          if (Object.keys(patch).length) updates.push({ ref: d.ref, data: patch });
        }
        if (updates.length) {
          const BATCH_LIMIT = 400;
          for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            for (const u of updates.slice(i, i + BATCH_LIMIT)) {
              batch.update(u.ref, u.data);
            }
            await batch.commit();
          }
        }
        last = snap.docs[snap.docs.length - 1];
        if (snap.size < CHEQUES_PAGE_SIZE) break;
      }
      try { localStorage.setItem(CHEQUES_MIGRATION_KEY, '1'); } catch { /* no-op */ }
    } catch (e) {
      console.warn('Cheque migration failed', e);
    }
  };

  const loadHistoryPage = async (opts?: { reset?: boolean }) => {
    if (historyLoading) return;
    if (opts?.reset) {
      setHistoryLastDoc(null);
      setHistoryLoadedAll(false);
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const last = opts?.reset ? null : historyLastDoc;
      const snap = await withIndexedDbRetry(async () => {
        const q = last
          ? query(collection(db, 'cheques'), orderBy('createdAt', 'desc'), startAfter(last), limit(HISTORY_PAGE_SIZE))
          : query(collection(db, 'cheques'), orderBy('createdAt', 'desc'), limit(HISTORY_PAGE_SIZE));
        return await getDocs(q);
      });
      const items = mapHistoryDocs(snap.docs);
      if (opts?.reset) {
        setHistoryRecords(items);
      } else {
        setHistoryRecords(prev => mergeHistory(prev, items));
      }
      const nextLast = snap.docs.length ? snap.docs[snap.docs.length - 1] : last;
      setHistoryLastDoc(nextLast);
      const reachedEnd = snap.size < HISTORY_PAGE_SIZE;
      setHistoryLoadedAll(reachedEnd);
    } catch (e: any) {
      console.warn('History load failed', e);
      setHistoryError(e?.message || 'Failed to load history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const isIndexedDbError = (e: any) => {
    const msg = (e?.message || '').toString();
    return e?.name === 'IndexedDbTransactionError' ||
      msg.includes('IndexedDbTransactionError') ||
      msg.includes('IDBTransaction') ||
      msg.includes('IndexedDB');
  };

  const withIndexedDbRetry = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e: any) {
      if (isIndexedDbError(e)) {
        const repaired = await repairIndexedDbPersistence();
        if (repaired) {
          try {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('rl:db-repaired'));
            }
          } catch { /* no-op */ }
          return await fn();
        }
      }
      throw e;
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const allDocs: any[] = [];
        let last: any = null;
        let firstBatch = true;
        while (true) {
          const snap = await withIndexedDbRetry(async () => {
            const q = last
              ? query(collection(db, 'payees'), orderBy('name', 'asc'), startAfter(last), limit(PAYEES_PAGE_SIZE))
              : query(collection(db, 'payees'), orderBy('name', 'asc'), limit(PAYEES_PAGE_SIZE));
            return await getDocs(q);
          });
          if (snap.empty) break;
          allDocs.push(...snap.docs);
          last = snap.docs[snap.docs.length - 1];
          const names = allDocs.map(d => (d.data().name as string || '').trim()).filter(Boolean);
          const merged = mergePayees(names);
          setPayees(merged);
          setPayeesLoaded(true);
          setPayeesError(null);
          try { localStorage.setItem(PAYEES_CACHE_KEY, JSON.stringify(merged)); } catch { /* no-op */ }
          if (firstBatch) firstBatch = false;
          if (snap.size < PAYEES_PAGE_SIZE) break;
        }
        setTimeout(() => { migratePayeesNameLower(allDocs).catch(e => console.warn('payee migration failed', e)); }, 600);
      } catch (e) {
        console.error('Failed to load payees', e);
        setPayeesError((e as any)?.message || 'Failed to load payees.');
        setPayeesLoaded(true);
      }
    };
    try {
      const cached = localStorage.getItem(PAYEES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length) {
          setPayees(parsed);
          setPayeesLoaded(true);
        }
      }
    } catch { /* no-op */ }
    load();
  }, [payeesReloadKey]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      const q = query(collection(db, 'payees'), orderBy('name', 'asc'));
      unsub = onSnapshot(q, snap => {
        const names = snap.docs.map(d => (d.data().name as string || '').trim()).filter(Boolean);
        const merged = mergePayees(names);
        setPayees(merged);
        setPayeesLoaded(true);
        setPayeesError(null);
        try { localStorage.setItem(PAYEES_CACHE_KEY, JSON.stringify(merged)); } catch { /* no-op */ }
      }, err => {
        console.warn('Live payee listener failed', err);
        setPayeesError(err?.message || 'Live payee sync failed.');
      });
    } catch (e) {
      console.warn('Failed to start live payee listener', e);
      setPayeesError((e as any)?.message || 'Live payee sync failed.');
    }
    return () => { if (unsub) unsub(); };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { migrateChequesPayToLower(); }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    if (!historyRecords.length || historyError) {
      loadHistoryPage({ reset: true });
    }
  }, [historyOpen, historyRecords.length, historyError]);

  useEffect(() => {
    const onRepaired = () => {
      setSystemToast('Local cache repaired, retrying...');
      setTimeout(() => setSystemToast(null), 2500);
    };
    try {
      window.addEventListener('rl:db-repaired', onRepaired as EventListener);
    } catch { /* no-op */ }
    return () => {
      try {
        window.removeEventListener('rl:db-repaired', onRepaired as EventListener);
      } catch { /* no-op */ }
    };
  }, []);

  // Print setup helper (one-time)
  const PRINT_SETUP_KEY = 'rl_print_setup_done_v1';
  useEffect(() => {
    try {
      const done = localStorage.getItem(PRINT_SETUP_KEY);
      if (!done) setShowPrintSetup(true);
    } catch (e) {
      setShowPrintSetup(true);
    }
  }, []);

  // Pending queue helpers (localStorage)
  const PENDING_KEY = 'rl_pending_cheques_v1';
  const loadPendingFromStorage = () => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return [];
      return JSON.parse(raw || '[]');
    } catch (e) { return []; }
  };
  const savePendingToStorage = (arr: any[]) => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr)); } catch (e) { console.warn('savePending failed', e); }
  };
  const addPending = (rec: any) => {
    const id = `p_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    const issuedAt = rec?.issuedAt || new Date().toISOString();
    const item = { id, ...rec, payToLower: normalizePayee(rec?.payTo || ''), issuedAt, issuedDay: rec?.issuedDay || isoToDay(issuedAt) };
    const next = [item, ...loadPendingFromStorage()];
    savePendingToStorage(next);
    setPendingQueue(next.slice(0,50));
  };

  // attempt to flush pending queue to Firestore
  const flushPending = async () => {
    const pending = loadPendingFromStorage();
    if (!pending.length) { setPendingQueue([]); return; }
    const remaining: any[] = [];
    for (const p of pending) {
      try {
        const issuedAt = p.issuedAt || new Date().toISOString();
        await addDoc(collection(db, 'cheques'), { payTo: p.payTo, payToLower: normalizePayee(p.payTo || ''), date: p.date, amountInNumbers: p.amountInNumbers, amountInWords: p.amountInWords, chequeNo: p.chequeNo, issuedAt, issuedDay: p.issuedDay || isoToDay(issuedAt), createdAt: serverTimestamp() });
      } catch (e) {
        console.warn('flushPending item failed', e, p);
        remaining.push(p);
      }
    }
    savePendingToStorage(remaining);
    setPendingQueue(remaining);
    // refresh recentCheques if current payee affected
    if (data.payTo) {
      try {
        await loadRecentForPayee(data.payTo);
      } catch (e) { console.warn('refresh after flush failed', e); }
    }
  };

  // try flush on mount and when online
  useEffect(() => {
    setPendingQueue(loadPendingFromStorage());
    flushPending();
    const onOnline = () => { flushPending(); };
    window.addEventListener('online', onOnline);
    const interval = setInterval(() => flushPending(), 30000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raw = data.payTo || '';
    const v = normalizePayee(raw);
    if (!v) { setFilteredPayees([]); setShowSuggestions(false); return; }
    const localMatches = payees.filter(p => normalizePayee(p).includes(v));
    const liveMatches = livePayeeMatches.filter(p => normalizePayee(p).includes(v));
    const merged = mergePayees(localMatches, liveMatches);
    setFilteredPayees(merged.slice(0, 10));
    setShowSuggestions(true);
  }, [payees, livePayeeMatches, data.payTo]);

  useEffect(() => {
    const term = normalizePayee(data.payTo || '');
    if (!term) { setLivePayeeMatches([]); setLivePayeesLoading(false); return; }
    let cancelled = false;
    setLivePayeesLoading(true);
    const timer = setTimeout(async () => {
      try {
        const snap = await withIndexedDbRetry(async () => {
          const q = query(
            collection(db, 'payees'),
            orderBy('nameLower'),
            startAt(term),
            endAt(term + '\uf8ff'),
            limit(20)
          );
          return await getDocs(q);
        });
        const names = snap.docs.map(d => (d.data().name as string || '').trim()).filter(Boolean);
        if (!cancelled) {
          setLivePayeeMatches(names);
          if (names.length) {
            setPayees(prev => {
              const next = mergePayees(names, prev);
              try { localStorage.setItem(PAYEES_CACHE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
              return next;
            });
          }
        }
      } catch (e) {
        console.warn('Live payee search failed', e);
        if (!cancelled) setLivePayeeMatches([]);
      } finally {
        if (!cancelled) setLivePayeesLoading(false);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [data.payTo]);

  useEffect(() => {
    const loadRecent = async () => {
      await loadRecentForPayee(data.payTo || '');
    };
    loadRecent();
  }, [data.payTo]);

  const addPayee = async (name?: string) => {
    const v = (name || data.payTo || '').trim();
    const existing = findExistingPayee(v);
    if (existing) { setData(d => ({ ...d, payTo: existing })); return; }
    if (!v) return;
    try {
      const norm = normalizePayee(v);
      if (norm) {
        try {
          const snap = await withIndexedDbRetry(async () => {
            const q = query(collection(db, 'payees'), where('nameLower', '==', norm), limit(1));
            return await getDocs(q);
          });
          if (!snap.empty) {
            const existingName = (snap.docs[0].data().name as string || '').trim();
            setData(d => ({ ...d, payTo: existingName || v }));
            return;
          }
        } catch (e) {
          console.warn('Payee lookup failed', e);
        }
      }
      await addDoc(collection(db, 'payees'), { name: v, nameLower: normalizePayee(v), createdAt: serverTimestamp() });
      setPayees(p => {
        const next = [v, ...p];
        try { localStorage.setItem(PAYEES_CACHE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
        return next;
      });
      setData(d => ({ ...d, payTo: v }));
    } catch (e) { console.error('Failed to add payee', e); }
  };

  const numberToWords = (numStr: string) => {
    const n = parseInt((numStr || '').toString().replace(/[^\d]/g, ''), 10);
    if (isNaN(n) || n === 0) return 'Zero Rupees Only';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const scales = [ {v:10000000, name:'Crore'}, {v:100000, name:'Lakh'}, {v:1000, name:'Thousand'}, {v:100, name:'Hundred'} ];
    const toWords = (x:number): string => {
      if (x < 20) return ones[x];
      if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? ' ' + ones[x%10] : '');
      if (x < 1000) return ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' ' + toWords(x%100) : '');
      return '';
    };
    let remainder = n; const parts:string[] = [];
    for (const s of scales) {
      if (remainder >= s.v) {
        const q = Math.floor(remainder / s.v);
        remainder = remainder % s.v;
        parts.push(`${toWords(q)} ${s.name}`);
      }
    }
    if (remainder > 0) parts.push(toWords(remainder));
    return parts.join(' ') + ' Rupees Only';
  };

  const dateToInput = (d: string) => {
    if (!d) return '';
    const s = d.includes('/') ? d.replace(/\//g, '') : d;
    if (s.length !== 8) return '';
    const dd = s.slice(0,2); const mm = s.slice(2,4); const yyyy = s.slice(4);
    return `${yyyy}-${mm}-${dd}`;
  };

  const inputToStored = (val: string) => {
    if (!val) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return val.replace(/\//g, '');
    const yyyy = val.slice(0,4); const mm = val.slice(5,7); const dd = val.slice(8);
    return `${dd}${mm}${yyyy}`;
  };

  const formatPreviewDate = (stored: string) => {
    if (!stored || stored.length !== 8) return '--/--/----';
    const dd = stored.slice(0,2); const mm = stored.slice(2,4); const yyyy = stored.slice(4);
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatAmountForPrint = (amount: string) => {
    const cleaned = (amount || '').toString().replace(/[^\d.]/g, '');
    if (!cleaned) return '';
    const parts = cleaned.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.') + '/-';
  };

  const handlePrint = () => {
    console.log('handlePrint invoked', { payTo: data.payTo, amount: data.amountInNumbers });
    if (!data.payTo || !data.amountInNumbers) {
      setPrintingToast('Please fill Payee and Amount before printing.');
      setTimeout(() => setPrintingToast(null), 2500);
      return;
    }
    // If payee is new, fire-and-forget add (do NOT await) so the print dialog is triggered by the user gesture
    try {
      if (!findExistingPayee((data.payTo || '').trim())) {
        addPayee((data.payTo || '').trim()).catch(e => console.warn('addPayee failed (background)', e));
      }
    } catch (e) {
      console.warn('background addPayee invocation failed', e);
    }

    // Save snapshot synchronously and call window.print() immediately so browser recognizes it as a user action
    setLastPrinted({ ...data });
    setLastPrintedAt(new Date().toISOString());
    try {
      setPrintingToast('Preparing print...');
      window.print();
      setTimeout(() => setPrintingToast(null), 2000);
    } catch (e) {
      console.error('window.print failed', e);
      setPrintingToast('Unable to open print dialog.');
      setTimeout(() => setPrintingToast(null), 3000);
    }
  };

  const persistChequeRecord = async (
    record: {
      payTo: string;
      payToLower?: string;
      date: string;
      amountInNumbers: string;
      amountInWords: string;
      chequeNo: string;
      issuedDay?: string;
      issuedAt?: string;
    },
    opts?: { openHistory?: boolean }
  ) => {
    const issuedAt = record.issuedAt || new Date().toISOString();
    const normalizedRecord = {
      ...record,
      payToLower: record.payToLower || normalizePayee(record.payTo || ''),
      issuedAt,
      issuedDay: record.issuedDay || isoToDay(issuedAt),
    };
    let savedRemotely = false;
    try {
      await addDoc(collection(db, 'cheques'), { ...normalizedRecord, createdAt: serverTimestamp() });
      savedRemotely = true;
    } catch (e) {
      console.warn('Remote save failed, queuing locally', e);
      addPending(normalizedRecord);
    }
    const newItem = { chequeNo: normalizedRecord.chequeNo, amount: normalizedRecord.amountInNumbers, date: normalizedRecord.date, payTo: normalizedRecord.payTo, issuedDay: normalizedRecord.issuedDay, issuedAt: normalizedRecord.issuedAt };
    setLastSavedRecord({
      payTo: normalizedRecord.payTo || '',
      amountInNumbers: normalizedRecord.amountInNumbers || '',
      date: normalizedRecord.date || '',
      chequeNo: normalizedRecord.chequeNo || '',
    });
    setRecentCheques(prev => [newItem, ...prev].slice(0, 5));
    setHistoryRecords(prev => mergeHistory(prev, [{ key: historyKey(newItem), ...newItem }]));
    try {
      if (normalizedRecord.payTo) {
        await loadRecentForPayee(normalizedRecord.payTo);
      }
    } catch (e) {
      console.error('Failed to refresh recent cheques', e);
    }
    setSaveError(null);
    setSaveSuccess(savedRemotely ? 'Cheque saved' : 'Saved locally (will sync when online)');
    if (opts?.openHistory) setHistoryOpen(true);
    setTimeout(() => setSaveSuccess(null), 2500);
    return savedRemotely;
  };

  const savePrintedCheque = async () => {
    if (!lastPrinted) { alert('No printed cheque to save. Please print first.'); return; }
    const chequeNo = window.prompt('Enter printed Cheque Number (required to save):');
    if (!chequeNo) { alert('Cheque not saved.'); return; }
    try {
      const record = {
        payTo: lastPrinted.payTo || '',
        payToLower: normalizePayee(lastPrinted.payTo || ''),
        date: lastPrinted.date || '',
        amountInNumbers: lastPrinted.amountInNumbers || '',
        amountInWords: lastPrinted.amountInWords || '',
        chequeNo,
        issuedAt: lastPrintedAt || new Date().toISOString(),
      };
      await persistChequeRecord(record, { openHistory: true });
      // ensure the cheque number is reflected in the app state so other UI (and WA button) shows it
      setData(d => ({ ...d, chequeNo }));
      // open whatsapp with cheque number included (use the saved record values)
      const day = record.date?.slice(0,2) || '';
      const month = record.date?.slice(2,4) || '';
      const year = record.date?.slice(4) || '';
      const amt = record.amountInNumbers ? `${record.amountInNumbers}/-` : '';
      const message = `${record.payTo || ''} ${amt} on ${day}/${month}/${year} : ${record.chequeNo || chequeNo}`.trim();
      console.log('Opening WhatsApp with message:', message, { record, chequeNo, dataChecqueNo: data.chequeNo });
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      // indicate success and clear lastPrinted
      setLastPrinted(null);
    } catch (e: any) { console.error('Save failed', e); setSaveError('Save failed: ' + (e?.message || e)); }
  };

    const historySearchTerm = (historySearch || '').toLowerCase().trim();
    const filteredHistory = historyRecords.filter(r => {
      if (historySearchTerm) {
        const hay = `${r.payTo || ''} ${r.chequeNo || ''}`.toLowerCase();
        if (!hay.includes(historySearchTerm)) return false;
      }
      const iso = issuedIsoToDateOnly(r.issuedAt || '') || storedDateToISO(r.date || '');
      if (historyFrom) {
        if (!iso || iso < historyFrom) return false;
      }
    if (historyTo) {
      if (!iso || iso > historyTo) return false;
    }
    return true;
  });

  return (
    <div>
      <header>
        <div className="brand">
          <span className="brand-icon">🏮</span>
          <span className="brand-name">Cheque Printer | Red Lantern Restaurant</span>
        </div>
      </header>

      {showPrintSetup && (
        <div className="setup-card">
          <div className="setup-title">One-time Print Setup (PWA)</div>
          <div className="setup-list">
            <div>1. Install the app (Add to Home Screen / Install App).</div>
            <div>2. Set Epson L3250 as default printer (Windows).</div>
            <div>3. Set custom paper size to 204mm x 95mm once in printer settings.</div>
            <div>4. Use the PRINT button for one-tap printing (system dialog will still appear).</div>
          </div>
          <div className="setup-actions">
            <button
              onClick={() => {
                try { localStorage.setItem(PRINT_SETUP_KEY, '1'); } catch (e) { /* ignore */ }
                setShowPrintSetup(false);
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="error-banner">
          <div>
            <strong>Save error:</strong> {saveError}
          </div>
          <div className="error-actions">
            <button onClick={() => window.open('https://console.firebase.google.com/project/redlanternchequeprinter/firestore', '_blank')}>Open Firestore Console</button>
            <button onClick={() => setSaveError(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {saveSuccess && (
        <div className="save-success" role="status">{saveSuccess}</div>
      )}
      {systemToast && (
        <div className="system-toast" role="status">{systemToast}</div>
      )}
      {printingToast && (
        <div className="printing-toast" role="status">{printingToast}</div>
      )}

      <div className="container">
        <div className="card">
          <span className="card-header">Details</span>

          <div className="input-wrapper">
            <label className="input-label">Payee Name</label>
            <input className="input-box" type="text" id="inputPayee" list="payee-list" placeholder="e.g. Joshua Foods" value={data.payTo} onChange={e => setData(d => ({ ...d, payTo: e.target.value }))} onFocus={() => { if (filteredPayees.length) setShowSuggestions(true); }} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} autoComplete="off" />
            <datalist id="payee-list">
              {payees.map(p => <option key={p} value={p} />)}
            </datalist>

            {showSuggestions && (
              <div className={`custom-dropdown ${filteredPayees.length > 0 ? 'active' : 'active'}`}>
                { payeesError ? (
                  <div className="dropdown-item" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{color:'#b91c1c'}}>Unable to load payees</div>
                    <button onMouseDown={() => setPayeesReloadKey(k => k + 1)}>Retry</button>
                  </div>
                ) : !payeesLoaded ? (
                  <div className="dropdown-item loading">Loading payees…</div>
                ) : livePayeesLoading && filteredPayees.length === 0 ? (
                  <div className="dropdown-item loading">Searching payees…</div>
                ) : filteredPayees.length > 0 ? (
                  filteredPayees.map(s => (
                    <div key={s} onMouseDown={() => { setData(d => ({ ...d, payTo: s })); setShowSuggestions(false); }} className="dropdown-item">{s}</div>
                  ))
                ) : (
                  <div className="dropdown-item" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{color:'var(--text-muted)'}}>&quot;{data.payTo}&quot; not found</div>
                    <div style={{display:'flex', gap:8}}>
                      <button className="dropdown-add-btn" onMouseDown={() => { addPayee(data.payTo); setShowSuggestions(false); }}>Add</button>
                      <button onMouseDown={() => setShowSuggestions(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Show last 3 cheques for this payee (between payee and amount) */}
          {recentCheques.length > 0 && (
            <div style={{marginTop:8, marginBottom:8, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:8}}>
              <div style={{fontSize:'0.95em', color:'#64748b', marginBottom:4}}>Last 3 cheques for this payee:</div>
              {recentCheques.map((c, i) => (
                <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:'0.97em', marginBottom:2}}>
                  <span>Date: {c.date ? `${c.date.slice(0,2)}/${c.date.slice(2,4)}/${c.date.slice(4)}` : '--/--/----'}</span>
                  <span>₹{c.amount}</span>
                  <span>Chq: {c.chequeNo}</span>
                </div>
              ))}
            </div>
          )}

          <div className="input-wrapper">
            <label className="input-label">Amount (₹)</label>
            <input
              className="input-box"
              type="text"
              inputMode="numeric"
              pattern="\d*"
              id="inputAmount"
              placeholder="0.00"
              value={data.amountInNumbers}
              onChange={e => {
                const cleaned = (e.target.value || '').replace(/[^0-9]/g, '');
                setData(d => ({ ...d, amountInNumbers: cleaned, amountInWords: numberToWords(cleaned) }));
              }}
              onKeyDown={e => {
                const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter','Home','End'];
                if (allowed.includes(e.key)) return;
                if (e.ctrlKey || e.metaKey) return;
                if (!/^[0-9]$/.test(e.key)) e.preventDefault();
              }}
              onPaste={e => {
                const pasted = e.clipboardData?.getData('text') || '';
                const cleaned = pasted.replace(/\D/g, '');
                if (cleaned !== pasted) {
                  e.preventDefault();
                  const el = e.currentTarget as HTMLInputElement;
                  const start = el.selectionStart || 0;
                  const end = el.selectionEnd || 0;
                  const newVal = el.value.slice(0, start) + cleaned + el.value.slice(end);
                  setData(d => ({ ...d, amountInNumbers: newVal, amountInWords: numberToWords(newVal) }));
                }
              }}
            />
          </div>

          <div className="input-wrapper">
            <label className="input-label">Date</label>
            <input className="input-box" type="date" id="inputDate" value={dateToInput(data.date)} onChange={e => setData(d => ({ ...d, date: inputToStored(e.target.value) }))} />
          </div>

          <div className="checkbox-wrapper" onClick={() => setData(d => ({ ...d, hidePayee: !d.hidePayee }))}>
            <input type="checkbox" id="togglePrintName" checked={!data.hidePayee} onChange={e => setData(d => ({ ...d, hidePayee: !e.target.checked }))} />
            <span className="checkbox-text">Print Payee Name on Cheque?</span>
          </div>
        </div>

        <div className="card preview-card">
          <span className="card-header" style={{marginBottom:10, color:'var(--primary)'}}>Live Preview</span>

          <div className="preview-row">
            <div>
              <div className="p-label">Date</div>
              <div className="p-value" id="prevDate">{formatPreviewDate(data.date)}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="p-label">Amount</div>
              <div className="p-value-lg" id="prevAmountNum">₹ {data.amountInNumbers ? Number(data.amountInNumbers).toLocaleString('en-IN') + '/-' : '0/-'}</div>
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div className="p-label">Pay To</div>
            <div className="p-value" id="prevPayee" style={{fontSize:'1rem', opacity: data.hidePayee ? 0.4 : 1}}>{data.payTo || 'Start typing...'}</div>
          </div>

          <div>
            <div className="p-label">Sum of</div>
            <div className="p-words" id="prevWords">{data.amountInWords || 'Zero Rupees Only'}</div>
          </div>
        </div>
      </div>

      <div className="bottom-dock">
        <button className="dock-btn btn-history" onClick={() => setHistoryOpen(true)} aria-label="History">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>
          </svg>
        </button>

        <button className="dock-btn btn-admin" onClick={() => setAdminOpen(v => !v)} aria-label="Admin" title="Admin">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7h18M3 12h18M3 17h18"></path>
          </svg>
        </button>

        {lastPrinted && (
          <button className="dock-btn btn-save" onClick={savePrintedCheque} title="Save printed cheque">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l7 7v9a2 2 0 0 1-2 2z"></path>
              <path d="M17 21v-8H7v8"></path>
            </svg>
          </button>
        )}

        <button className="dock-btn btn-print" onClick={handlePrint} aria-label="Print">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" xmlns="http://www.w3.org/2000/svg">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          PRINT
        </button>

        <button className="dock-btn btn-wa" onClick={() => {
          const fallbackPayTo = lastSavedRecord?.payTo || '';
          const fallbackAmount = lastSavedRecord?.amountInNumbers || '';
          const fallbackDate = lastSavedRecord?.date || '';
          let chq = data.chequeNo || '';
          const wasMissing = !chq;
          if (!chq) {
            const entered = window.prompt('Enter cheque number to include in WhatsApp:');
            if (!entered || !entered.trim()) return;
            chq = entered.trim();
            setData(d => ({ ...d, chequeNo: chq }));
          }
          if (wasMissing) {
            if (!data.payTo || !data.amountInNumbers || !data.date) {
              setSaveError('Unable to auto-save. Please fill Payee, Amount, and Date first.');
              setTimeout(() => setSaveError(null), 3000);
            } else {
              const record = {
                payTo: data.payTo || '',
                payToLower: normalizePayee(data.payTo || ''),
                date: data.date || '',
                amountInNumbers: data.amountInNumbers || '',
                amountInWords: data.amountInWords || '',
                chequeNo: chq,
                issuedAt: new Date().toISOString(),
              };
              persistChequeRecord(record).catch(e => console.warn('auto-save from WhatsApp failed', e));
            }
          }
          const payTo = (data.payTo || fallbackPayTo || '').trim();
          const amountNum = (data.amountInNumbers || fallbackAmount || '').trim();
          const dateStored = (data.date || fallbackDate || '').trim();
          const dateText = dateStored ? formatPreviewDate(dateStored) : '';
          if (!payTo || !amountNum || !dateText) {
            setSaveError('Missing Payee/Amount/Date for WhatsApp message.');
            setTimeout(() => setSaveError(null), 3000);
            return;
          }
          const amt = `${amountNum}/-`;
          const message = `${payTo} ${amt} on ${dateText} : ${chq}`.trim();
          console.log('WA button message:', message, { data, payTo, amountNum, dateText });
          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        }} aria-label="WhatsApp">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
        </button>
      </div>

      <div className={`history-overlay ${historyOpen ? 'active' : ''}`} onClick={() => setHistoryOpen(false)}></div>
      <div className={`history-drawer ${historyOpen ? 'active' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">Print History</span>
          <button onClick={() => setHistoryOpen(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>&times;</button>
        </div>
        <div className="history-filters">
          <input
            className="history-input"
            type="text"
            placeholder="Search by name or cheque number"
            value={historySearchInput}
            onChange={e => setHistorySearchInput(e.target.value)}
          />
          <div className="history-filter-row">
            <input
              className="history-input"
              type="date"
              value={historyFromInput}
              onChange={e => setHistoryFromInput(e.target.value)}
            />
            <input
              className="history-input"
              type="date"
              value={historyToInput}
              onChange={e => setHistoryToInput(e.target.value)}
            />
          </div>
          <div className="history-actions">
            <button
              className="history-btn primary"
              onClick={() => {
                setHistorySearch(historySearchInput.trim());
                setHistoryFrom(historyFromInput);
                setHistoryTo(historyToInput);
              }}
            >
              Search
            </button>
            <button
              className="history-btn ghost"
              onClick={() => {
                setHistorySearchInput('');
                setHistoryFromInput('');
                setHistoryToInput('');
                setHistorySearch('');
                setHistoryFrom('');
                setHistoryTo('');
              }}
            >
              Reset
            </button>
            <button className="history-btn ghost" onClick={() => loadHistoryPage({ reset: true })}>
              Refresh
            </button>
          </div>
        </div>
        <div className="history-meta">
          Showing {filteredHistory.length} of {historyRecords.length} loaded
        </div>
        <div className="history-list">
          {historyError ? (
            <div style={{textAlign:'center', padding:20, color:'#b91c1c'}}>{historyError}</div>
          ) : historyLoading && historyRecords.length === 0 ? (
            <div style={{textAlign:'center', padding:20, color:'#aaa'}}>Loading history…</div>
          ) : filteredHistory.length === 0 ? (
            <div style={{textAlign:'center', padding:20, color:'#aaa'}}>No records found</div>
          ) : (
            filteredHistory.map(r => {
              const issued = r.issuedDay || storedDateToDay(r.date || '');
              const dateText = r.date ? formatPreviewDate(r.date) : '--/--/----';
              return (
                <div key={r.key} className="history-item">
                  <div>
                    <div className="h-name">{r.payTo || '—'}</div>
                    <div className="h-date">
                      Cheque: {dateText}{issued ? ` • ${issued}` : ''}
                    </div>
                    {r.issuedAt && (
                      <div className="h-date">Issued: {isoToDisplay(r.issuedAt)}</div>
                    )}
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="h-price">₹{r.amount || ''}</div>
                    <div style={{fontSize:'0.85rem', color: 'var(--text-muted)'}}>Chq: {r.chequeNo || '--'}</div>
                  </div>
                </div>
              );
            })
          )}
          {!historyLoadedAll && !historyLoading && (
            <div style={{textAlign:'center', padding:16}}>
              <button className="history-btn ghost" onClick={() => loadHistoryPage()}>
                Load more
              </button>
            </div>
          )}
          {historyLoading && historyRecords.length > 0 && (
            <div style={{textAlign:'center', padding:12, color:'#94a3b8'}}>Loading more…</div>
          )}
        </div>
      </div>

      <div className={`history-overlay ${adminOpen ? 'active' : ''}`} onClick={() => setAdminOpen(false)}></div>
      <div className={`history-drawer ${adminOpen ? 'active' : ''}`} style={{height:'60vh'}}>
        <div className="drawer-header">
          <span className="drawer-title">Admin - Pending & Remote</span>
          <div style={{display:'flex', gap:8}}>
            <button onClick={async () => {
              setAdminLoading(true);
              setDbStatus(null);
              try {
                // try load some docs from Firestore (best-effort)
                const snap = await withIndexedDbRetry(async () => {
                  const q = query(collection(db, 'cheques'), orderBy('createdAt', 'desc'), limit(50));
                  return await getDocs(q);
                });
                setAdminDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); 
                setDbStatus({ ok: true });
              } catch (e: any) { 
                console.warn('admin load failed', e); 
                setAdminDocs([]); 
                setDbStatus({ ok: false, msg: e.message || 'Unknown error' });
              }
              setAdminLoading(false);
            }}>Refresh</button>
            <button onClick={() => setAdminOpen(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>&times;</button>
          </div>
        </div>
        <div style={{padding:16}}>
          {dbStatus && (
            <div style={{ padding: '8px 12px', marginBottom: 16, borderRadius: 6, backgroundColor: dbStatus.ok ? '#dcfce7' : '#fee2e2', color: dbStatus.ok ? '#166534' : '#991b1b', fontSize: '0.9rem' }}>
              {dbStatus.ok ? '✅ Database is operational' : `❌ Database Error: ${dbStatus.msg}`}
            </div>
          )}
          <div style={{marginBottom:12}}><strong>Pending (local)</strong></div>
          {pendingQueue.length === 0 ? (
            <div style={{color:'#888', padding:12}}>No pending items</div>
          ) : pendingQueue.map(p => (
            <div key={p.id} style={{padding:10, borderBottom:'1px solid #f1f5f9'}}>
              <div style={{fontWeight:700}}>{p.payTo} — ₹{p.amountInNumbers}</div>
              <div style={{fontSize:'0.9rem', color:'#555'}}>Date: {p.date} • Chq: {p.chequeNo}</div>
            </div>
          ))}

          <div style={{marginTop:18}}><strong>Firestore (remote)</strong></div>
          {adminLoading ? <div style={{color:'#888', padding:12}}>Loading...</div> : (
            adminDocs.length === 0 ? <div style={{color:'#888', padding:12}}>No remote documents loaded</div> : adminDocs.map(d => (
              <div key={d.id} style={{padding:10, borderBottom:'1px solid #f1f5f9'}}>
                <div style={{fontWeight:700}}>{d.payTo} — ₹{d.amountInNumbers}</div>
                <div style={{fontSize:'0.9rem', color:'#555'}}>Date: {d.date} • Chq: {d.chequeNo}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="cheque-print-container">
        <div className="print-date-field">{data.date}</div>
        <div className="print-pay-field">{!data.hidePayee ? data.payTo : ''}</div>
        <div className="print-amount-words">{data.amountInWords}</div>
        <div className="print-amount-numbers">{data.amountInNumbers ? formatAmountForPrint(data.amountInNumbers) : ''}</div>
      </div>

    </div>
  );
}
