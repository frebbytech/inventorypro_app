import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "../ui/separator";

// Explicit generic component props definition
interface LogValuesHoverCardProps<T extends Record<string, any>> {
  entityType: string;
  values: T | string | null | undefined;
  maxWidthValue?: string;
}

export function LogValuesHoverCard<T extends Record<string, any>>({
  entityType,
  values,
  maxWidthValue = "max-w-[180px]",
}: LogValuesHoverCardProps<T>) {
  if (!values) return <span>—</span>;

  // Safely parse stringified JSON or use the direct object
  const data: T = typeof values === "string" ? JSON.parse(values) : values;

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4 select-all">
          {JSON.stringify(data)}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 JSON-values-content bg-card" side="bottom">
        <p className="uppercase font-bold pb-2 text-foreground">{entityType}</p>
        <Separator />
        <div className="space-y-1.5 text-sm">
          {Object.entries(data).map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between items-center border-b border-muted pb-1 last:border-0 last:pb-0 gap-2"
            >
              <span className="font-medium text-muted-foreground capitalize shrink-0">
                {key.replace(/_/g, " ")}:
              </span>
              <span
                className={`font-mono text-foreground truncate ${maxWidthValue}`}
              >
                {value === null || value === undefined ? "—" : String(value)}
              </span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
