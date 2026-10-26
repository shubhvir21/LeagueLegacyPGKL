import { TradeTreeSection } from './TradeTree'
import { WhatIfSection } from './WhatIf'

/** What-If Machine and Trade Trees: how one result or one trade ripples through a season. */
export default function Butterfly() {
  return (
    <div className="page">
      <h1>Butterfly Effect</h1>
      <WhatIfSection />
      <TradeTreeSection />
    </div>
  )
}
