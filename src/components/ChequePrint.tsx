import { useEffect } from 'react';
import type { ChequeData } from '../types';
import './ChequePrint.css'

interface ChequePrintProps {
  data: ChequeData
  onMount?: () => void
  onUnmount?: () => void
}

export default function ChequePrint({ data, onMount, onUnmount }: ChequePrintProps) {
  // This component is ONLY for printing - shows only the fillable fields
  // Positioned to match the real cheque paper dimensions (9.5cm x 20.4cm)
  // Calls `onMount` when the print container is mounted so the parent
  // can wait for it before triggering `window.print()`.

  useEffect(() => {
    onMount?.();
    return () => { onUnmount?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="cheque-print-container">
      {/* Date Field - 1cm from top, starts at 15.7cm from left */}
      <div className="print-date-field">
        {data.date || ''}
      </div>

      {/* Pay To Field - 2.7cm from left, positioned below date area */}
      <div className="print-pay-field">
        {data.payTo || ''}
      </div>

      {/* Amount in Words - 16cm width, positioned below Pay */}
      <div className="print-amount-words">
        {data.amountInWords || ''}
      </div>

      {/* Amount in Numbers - positioned at right side */}
      <div className="print-amount-numbers">
        {data.amountInNumbers ? formatAmountWithSuffix(data.amountInNumbers) : ''}
      </div>
    </div>
  )
}

function formatAmountWithSuffix(amount: string) {
  const cleaned = (amount || '').toString().replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.') + '/-';
}
