import { useState, useEffect } from 'react';
import { db, repairIndexedDbPersistence } from './firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
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
  const [filteredPayees, setFilteredPayees] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentCheques, setRecentCheques] = useState<Array<{ chequeNo?: string; amount?: string; date?: string; payTo?: string }>>([]);
  const [lastPrinted, setLastPrinted] = useState<ChequeData | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
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
        const snap = await withIndexedDbRetry(async () => {
          const q = query(collection(db, 'payees'), orderBy('name', 'asc'), limit(500));
          return await getDocs(q);
        });
        const names = snap.docs.map(d => (d.data().name as string || '').trim()).filter(Boolean);
        setPayees(names);
        setPayeesLoaded(true);
      } catch (e) {
        console.error('Failed to load payees', e);
        setPayeesLoaded(true);
      }
    };
    load();
  }, []);

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
    const item = { id, ...rec };
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
        await addDoc(collection(db, 'cheques'), { payTo: p.payTo, date: p.date, amountInNumbers: p.amountInNumbers, amountInWords: p.amountInWords, chequeNo: p.chequeNo, createdAt: serverTimestamp() });
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
        const snap = await withIndexedDbRetry(async () => {
          const q = query(collection(db, 'cheques'), where('payTo', '==', data.payTo), orderBy('createdAt', 'desc'), limit(5));
          return await getDocs(q);
        });
        const items = snap.docs.map(d => ({ chequeNo: d.data().chequeNo as string, amount: d.data().amountInNumbers as string, date: d.data().date as string, payTo: d.data().payTo as string }));
        setRecentCheques(items);
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
    const v = (data.payTo || '').trim();
    if (!v) { setFilteredPayees([]); setShowSuggestions(false); return; }
    const low = v.toLowerCase();
    const matches = payees.filter(p => (p || '').toLowerCase().includes(low));
    setFilteredPayees(matches.slice(0, 10));
    setShowSuggestions(true);
  }, [payees, data.payTo]);

  useEffect(() => {
    const loadRecent = async () => {
      const p = data.payTo?.trim();
      if (!p) { setRecentCheques([]); return; }
      try {
        const snap = await withIndexedDbRetry(async () => {
          const q = query(collection(db, 'cheques'), where('payTo', '==', p), orderBy('createdAt', 'desc'), limit(3));
          return await getDocs(q);
        });
        const items = snap.docs.map(d => ({
          chequeNo: d.data().chequeNo as string,
          amount: d.data().amountInNumbers as string,
          date: d.data().date as string,
          payTo: d.data().payTo as string,
        }));
        setRecentCheques(items);
      } catch (e) { console.error('Failed to load recent cheques', e); }
    };
    loadRecent();
  }, [data.payTo]);

  const addPayee = async (name?: string) => {
    const v = (name || data.payTo || '').trim();
    if (!v) return;
    try {
      if (!payees.includes(v)) {
        await addDoc(collection(db, 'payees'), { name: v, createdAt: serverTimestamp() });
        setPayees(p => [v, ...p]);
      }
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
      if (!payees.includes((data.payTo || '').trim())) {
        addPayee((data.payTo || '').trim()).catch(e => console.warn('addPayee failed (background)', e));
      }
    } catch (e) {
      console.warn('background addPayee invocation failed', e);
    }

    // Save snapshot synchronously and call window.print() immediately so browser recognizes it as a user action
    setLastPrinted({ ...data });
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

  const savePrintedCheque = async () => {
    if (!lastPrinted) { alert('No printed cheque to save. Please print first.'); return; }
    const chequeNo = window.prompt('Enter printed Cheque Number (required to save):');
    if (!chequeNo) { alert('Cheque not saved.'); return; }
    try {
      const record = {
        payTo: lastPrinted.payTo || '',
        date: lastPrinted.date || '',
        amountInNumbers: lastPrinted.amountInNumbers || '',
        amountInWords: lastPrinted.amountInWords || '',
        chequeNo,
      };
      // attempt to save to Firestore; if it fails, queue locally
      let savedRemotely = false;
      try {
        const docRef = await addDoc(collection(db, 'cheques'), { ...record, createdAt: serverTimestamp() });
        savedRemotely = true;
      } catch (e) {
        console.warn('Remote save failed, queuing locally', e);
        addPending(record);
      }
      // optimistically update recentCheques immediately so user sees the saved item
      const newItem = { chequeNo: record.chequeNo, amount: record.amountInNumbers, date: record.date, payTo: record.payTo };
      setRecentCheques(prev => [newItem, ...prev].slice(0, 5));
      // reload recent cheques for the payee that was printed (use lastPrinted.payTo) to keep server state in sync
      try {
        const payee = (lastPrinted.payTo || '').trim();
        if (payee) {
          const snap = await withIndexedDbRetry(async () => {
            const q = query(collection(db, 'cheques'), where('payTo', '==', payee), orderBy('createdAt', 'desc'), limit(5));
            return await getDocs(q);
          });
          const items = snap.docs.map(d => ({
            chequeNo: d.data().chequeNo as string,
            amount: d.data().amountInNumbers as string,
            date: d.data().date as string,
            payTo: d.data().payTo as string,
          }));
          setRecentCheques(items);
        }
      } catch (e) {
        console.error('Failed to refresh recent cheques', e);
      }
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
      setSaveError(null);
      setSaveSuccess(savedRemotely ? 'Cheque saved' : 'Saved locally (will sync when online)');
      setHistoryOpen(true);
      setTimeout(() => setSaveSuccess(null), 2500);
      setLastPrinted(null);
    } catch (e: any) { console.error('Save failed', e); setSaveError('Save failed: ' + (e?.message || e)); }
  };

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
                { !payeesLoaded ? (
                  <div className="dropdown-item loading">Loading payees…</div>
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

            {/* Show last 3 cheques for this payee */}
            {recentCheques.length > 0 && (
              <div style={{marginTop:8, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:8}}>
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
          </div>

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
          const day = (data.date || '').slice(0,2); const month = (data.date || '').slice(2,4); const year = (data.date || '').slice(4);
          const amt = data.amountInNumbers ? `${data.amountInNumbers}/-` : '';
          const chq = data.chequeNo || '';
          const message = `${data.payTo || ''} ${amt} on ${day}/${month}/${year} : ${chq}`.trim();
          console.log('WA button message:', message, { data });
          if (!chq) {
            // warn user that cheque number isn't set yet
            setSaveError('No cheque number set — save first to include cheque number in WhatsApp.');
            setTimeout(() => setSaveError(null), 3000);
            return;
          }
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
        <div className="history-list">
          {recentCheques.length === 0 ? (
            <div style={{textAlign:'center', padding:20, color:'#aaa'}}>No history yet</div>
          ) : recentCheques.map((r, i) => (
            <div key={i} className="history-item">
              <div>
                <div className="h-name">{r.payTo || data.payTo}</div>
                <div className="h-date">{r.date ? `${r.date.slice(0,2)}/${r.date.slice(2,4)}/${r.date.slice(4)}` : ''}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="h-price">₹{r.amount}</div>
                {r.chequeNo && <div style={{fontSize:'0.85rem', color: 'var(--text-muted)'}}>Chq: {r.chequeNo}</div>}
              </div>
            </div>
          ))}
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
