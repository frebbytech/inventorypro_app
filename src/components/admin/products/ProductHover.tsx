import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Add this helper function outside your component to format the JSON nicely
export function ProductHover({ values }: { values: any }) {
  if (!values) return <span>—</span>;
  
  // Parse if it's a string, otherwise use as object
  const data = typeof values === "string" ? JSON.parse(values) : values;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4">
          {JSON.stringify(data)}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 JSON-values-content">
        <div className="space-y-1.5 text-sm">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-muted pb-1 last:border-0 last:pb-0">
              <span className="font-medium text-muted-foreground capitalize">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="font-mono text-foreground truncate max-w-[180px]">
                {value === null || value === undefined ? "—" : String(value)}
              </span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}



