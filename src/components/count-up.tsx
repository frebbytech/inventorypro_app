"use client";

import NumberFlow from "@number-flow/react";
import React, { useMemo } from "react";

// Native type helper provided directly by the library for clean typing
type NumberFlowFormat = React.ComponentProps<typeof NumberFlow>["format"];

interface CountUpProps {
  value: number;
  format?: NumberFlowFormat;
  className?: string;
}

function CountUp({
  value,
  format,
  className,
}: CountUpProps) {
  // Memoize fallback format configuration so it doesn't recreate references on re-renders
  const finalFormat = useMemo<NumberFlowFormat>(() => {
    
    if (format) return format;
    
    return {
      // notation:'compact',
      
      style: "currency",
      currency: "GHS",
      currencyDisplay: "narrowSymbol", // Standardizes the 'GH₵' symbol placement
      
    };
  }, [format]);

  return (
    <NumberFlow 
      value={value} 
      className={className} 
      format={finalFormat} 
      	// transformTiming={{ duration: 750, easing: 'linear(...)' }}
    />
  );
}

export default CountUp;
