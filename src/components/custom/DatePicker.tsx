"use client";

import { HTMLAttributes, useEffect, useState } from "react";
import { CalendarIcon } from "@radix-ui/react-icons";
import {
  format,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateRangeType } from "@/lib/searchparams";

type DateRangePickerProps = {
  date: dateRangeType | null;
  setDate: (
    value:
      | dateRangeType
      | null

      | ((old: dateRangeType | null) => dateRangeType | null),
  ) => void;
  className?: HTMLAttributes<HTMLDivElement>;
};

export function DateRangePicker({
  date,
  setDate,
  className,
}: DateRangePickerProps) {
  // Controlled state string to manage the preset dropdown value selection
  const [presetValue, setPresetValue] = useState<string>("");

  // Sync state: If date is cleared externally (e.g. by Reset Filters), reset the dropdown label text
  useEffect(() => {
    if (!date || (date?.from === undefined && date?.to === undefined)) {
      setPresetValue("showAll");
    }
  }, [date]);

  const selectedRange: DateRange = {
    from: date?.from ?? undefined,
    to: date?.to ?? undefined,
  };

  const handlePresetChange = (preset: string) => {
    setPresetValue(preset);
    const now = new Date();
    switch (preset) {
      case "today":
        setDate({ from: startOfDay(now), to: endOfDay(now) });
        break;
      case "yesterday": {
        const yesterday = subDays(now, 1);
        setDate({ from: startOfDay(yesterday), to: endOfDay(yesterday) });
        break;
      }
      case "thisWeek":
        setDate({ from: startOfWeek(now), to: endOfWeek(now) });
        break;
      case "lastWeek": {
        const lastWeek = subWeeks(now, 1);
        setDate({ from: startOfWeek(lastWeek), to: endOfWeek(lastWeek) });
        break;
      }
      case "last7":
        setDate({ from: startOfDay(subDays(now, 7)), to: endOfDay(now) });
        break;
      case "thisMonth":
        setDate({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case "lastMonth": {
        const lastMonth = subMonths(now, 1);
        setDate({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      }
      case "thisYear":
        setDate({ from: startOfYear(now), to: endOfYear(now) });
        break;
      case "lastYear": {
        const lastYear = subYears(now, 1);
        setDate({ from: startOfYear(lastYear), to: endOfYear(lastYear) });
        break;
      }
      case "showAll":
        setDate(null);
        break;
      default:
        break;
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Bind value and onValueChange to control the active selection state strictly */}
      <Select value={presetValue} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-[140px] h-9">
          <SelectValue placeholder="Quick Presets" />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="thisWeek">This Week</SelectItem>
          <SelectItem value="lastWeek">Last Week</SelectItem>
          <SelectItem value="last7">Last 7 Days</SelectItem>
          <SelectItem value="thisMonth">This Month</SelectItem>
          <SelectItem value="lastMonth">Last Month</SelectItem>
          <SelectItem value="thisYear">This Year</SelectItem>
          <SelectItem value="lastYear">Last Year</SelectItem>
          <SelectItem value="showAll">All</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            size="sm"
            className={cn(
              "w-[260px] justify-start text-left font-normal gap-2 h-9",
              (!date || !date.from) && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>All Time</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={date?.from ?? new Date()}
            selected={selectedRange}
            onSelect={(range) => {
              // Custom selections break preset boundaries, so clear the dropdown label selection string
              setPresetValue("");
              if (!range) {
                setDate(null);
                return;
              }
              setDate({ from: range.from, to: range.to });
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}


// "use client";

// import { HTMLAttributes, useEffect, useState } from "react";
// import { CalendarIcon } from "@radix-ui/react-icons";
// import {
//   format,
//   subDays,
//   startOfDay,
//   endOfDay,
//   startOfMonth,
//   endOfMonth,
//   startOfYear,
//   endOfYear,
// } from "date-fns";
// import { DateRange } from "react-day-picker";

// import { cn } from "@/lib/utils";
// import { Button } from "@/components/ui/button";
// import { Calendar } from "@/components/ui/calendar";
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { dateRangeType } from "@/lib/searchparams";

// type DateRangePickerProps = {
//   date: dateRangeType | null;
//   setDate: (
//     value:
//       | dateRangeType
//       | null
//       | ((old: dateRangeType | null) => dateRangeType | null),
//   ) => void;
//   className?: HTMLAttributes<HTMLDivElement>;
// };

// export function DateRangePicker({
//   date,
//   setDate,
//   className,
// }: DateRangePickerProps) {
//   // Controlled state string to manage the preset dropdown value selection
//   const [presetValue, setPresetValue] = useState<string>("");

//   // Sync state: If date is cleared externally (e.g. by Reset Filters), reset the dropdown label text
//   useEffect(() => {
  
//     if (!date || (date?.from === undefined && date?.to === undefined)) {
//       setPresetValue("showAll");
//     }
//   }, [date]);

//   const selectedRange: DateRange = {
//     from: date?.from ?? undefined,
//     to: date?.to ?? undefined,
//   };

//   const handlePresetChange = (preset: string) => {
//     setPresetValue(preset);
//     const now = new Date();
//     switch (preset) {
//       case "today":
//         setDate({ from: startOfDay(now), to: endOfDay(now) });
//         break;
//       case "last7":
//         setDate({ from: startOfDay(subDays(now, 7)), to: endOfDay(now) });
//         break;
//       case "thisMonth":
//         setDate({ from: startOfMonth(now), to: endOfMonth(now) });
//         break;
//       case "thisYear":
//         setDate({ from: startOfYear(now), to: endOfYear(now) });
//         break;
//       case "showAll":
//         setDate(null);
//         break;
//       default:
//         break;
//     }
//   };

//   return (
//     <div className={cn("flex items-center gap-2", className)}>
//       {/* Bind value and onValueChange to control the active selection state strictly */}
//       <Select value={presetValue} onValueChange={handlePresetChange}>
//         <SelectTrigger className="w-[140px] h-9">
//           <SelectValue placeholder="Quick Presets" />
//         </SelectTrigger>
//         <SelectContent align="start">
//           <SelectItem value="today">Today</SelectItem>
//           <SelectItem value="last7">Last 7 Days</SelectItem>
//           <SelectItem value="thisMonth">This Month</SelectItem>
//           <SelectItem value="thisYear">This Year</SelectItem>
//           <SelectItem value="showAll">All</SelectItem>
//         </SelectContent>
//       </Select>

//       <Popover>
//         <PopoverTrigger asChild>
//           <Button
//             id="date"
//             variant="outline"
//             size="sm"
//             className={cn(
//               "w-[260px] justify-start text-left font-normal gap-2 h-9",
//               (!date || !date.from) && "text-muted-foreground",
//             )}
//           >
//             <CalendarIcon className="h-4 w-4" />
//             {date?.from ? (
//               date.to ? (
//                 <>
//                   {format(date.from, "LLL dd, y")} -{" "}
//                   {format(date.to, "LLL dd, y")}
//                 </>
//               ) : (
//                 format(date.from, "LLL dd, y")
//               )
//             ) : (
//               <span>All Time</span>
//             )}
//           </Button>
//         </PopoverTrigger>
//         <PopoverContent className="w-auto p-0" align="start">
//           <Calendar
//             mode="range"
//             defaultMonth={date?.from ?? new Date()}
//             selected={selectedRange}
//             onSelect={(range) => {
//               // Custom selections break preset boundaries, so clear the dropdown label selection string
//               setPresetValue("");
//               if (!range) {
//                 setDate(null);
//                 return;
//               }
//               setDate({ from: range.from, to: range.to });
//             }}
//             numberOfMonths={2}
//           />
//         </PopoverContent>
//       </Popover>
//     </div>
//   );
// }
