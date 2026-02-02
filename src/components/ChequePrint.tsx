import { ChequeData } from '../App'
import './ChequePrint.css'

interface ChequePrintProps {
  data: ChequeData
}

export default function ChequePrint({ data }: ChequePrintProps) {
  // This component is ONLY for printing - shows only the fillable fields
  // Positioned to match the real cheque paper dimensions (9.5cm x 20.4cm)
  
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
        {data.amountInNumbers || ''}
      </div>
    </div>
  )
}
