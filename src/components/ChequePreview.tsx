import type { ChequeData } from '../types';
import './ChequePreview.css'


interface ChequePreviewProps {
  data: ChequeData
}

export default function ChequePreview({ data }: ChequePreviewProps) {
  // Split date into individual digits for cell-like display
  const renderDateCells = () => {
    const dateStr = data.date || 'DDMMYYYY'
    const digits = dateStr.padEnd(8, ' ').split('')
    const labels = ['D', 'D', 'M', 'M', 'Y', 'Y', 'Y', 'Y']
    
    return (
      <div className="date-cells">
        {digits.map((digit, index) => (
          <div key={index} className="date-cell">
            <span className="date-cell-label">{labels[index]}</span>
            <span className="date-cell-value">{digit === ' ' ? '' : digit}</span>
          </div>
        ))}
      </div>
    )
  }

  // Format amount with proper spacing and separators
  const formatAmount = (amount: string) => {
    if (!amount) return ''
    // Remove any non-digit characters except decimal point
    const cleaned = amount.replace(/[^\d.]/g, '')
    // Add thousand separators if needed
    const parts = cleaned.split('.')
    if (parts[0]) {
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
    return parts.join('.')
  }

  return (
    <div className="cheque-preview">
      <div className="cheque">
        {/* Header Section */}
        <div className="cheque-header">
          <div className="bank-logo">
            <div className="logo-circle">B</div>
            <div className="bank-name">
              <div className="hindi-name">बैंक ऑफ बड़ौदा</div>
              <div className="english-name">Bank of Baroda</div>
            </div>
          </div>
          <div className="validity-text">
            VALID FOR THREE MONTHS FROM THE DATE OF ISSUE
          </div>
        </div>

        {/* Branch Info */}
        <div className="branch-info">
          <div className="branch-name">{data.branch}</div>
          <div className="ifsc-code">RTGS/NEFT IFSC CODE: {data.ifscCode}</div>
        </div>

        {/* Date Field - positioned at top right with individual cells */}
        <div className="date-field">
          <span className="date-label">Date</span>
          {renderDateCells()}
        </div>

        {/* Pay To Field */}
        <div className="pay-field">
          <span className="pay-label">Pay</span>
          <div className="pay-value">{data.payTo || '_________________________'}</div>
          <span className="or-bearer">Or Bearer</span>
        </div>

        {/* Amount in Words */}
        <div className="amount-words-field">
          <span className="rupees-label">Rupees रुपये</span>
          <div className="amount-words-underline-block">
            <div className="amount-words-value">
              {data.amountInWords || ''}
            </div>
          </div>
        </div>

        {/* Amount in Numbers */}
        <div className="amount-numbers-field">
          <span className="rupee-symbol">₹</span>
          <div className="amount-numbers-box">
            <div className="amount-numbers-value">
              {formatAmount(data.amountInNumbers) || ''}
            </div>
          </div>
        </div>

        {/* Account Number */}
        <div className="account-field">
          <span className="account-label">खा. सं. A/c No.</span>
          <div className="account-value">{data.accountNumber}</div>
          <span className="account-type">चालू खाता / CURRENT ACCOUNT</span>
        </div>

        {/* Payee Name (if provided) */}
        {data.payeeName && (
          <div className="payee-name">{data.payeeName}</div>
        )}

        {/* Signature Line */}
        <div className="signature-line">
          <div className="signature-space"></div>
          <div className="authorized-signatory">Authorized Signatory</div>
        </div>

        {/* Footer */}
        <div className="cheque-footer">
          <div className="footer-text">
            भारत की सभी शाखाओं में सममूल्यपर देय / Payable at par at all branches in India
          </div>
          <div className="micr-code">⑈001741⑈ 403012017⑆ 200360⑈ 29</div>
        </div>
      </div>
    </div>
  )
}
