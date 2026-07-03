import React from 'react';
import LocationManager from './field/LocationManager.jsx';
import PabrikCatalog from './field/PabrikCatalog.jsx';
import OmsetReport from './field/OmsetReport.jsx';
import DeliveryRecap from './field/DeliveryRecap.jsx';

/**
 * ponytail: backward-compatible wrapper — composes the 4 field sub-modules
 * using the old boolean-flag interface. Prefer importing sub-modules directly.
 *
 * @param {{ period?: string, onPeriodChange?: (p: string) => void, showOmset?: boolean, showPabrik?: boolean, showTonase?: boolean, showDeliveryRecap?: boolean, recapEditable?: boolean }} props
 */
export default function FieldOperationsPanel({
  period: periodProp,
  onPeriodChange,
  showOmset = true,
  showPabrik = true,
  showTonase = true,
  showDeliveryRecap = false,
  recapEditable = false,
}) {
  const showCatalog = showPabrik || showTonase;

  return (
    <div className="space-y-6">
      {showOmset && <OmsetReport period={periodProp} onPeriodChange={onPeriodChange} />}
      {showCatalog && <LocationManager />}
      {showCatalog && <PabrikCatalog />}
      {showDeliveryRecap && <DeliveryRecap editable={recapEditable} />}
    </div>
  );
}
