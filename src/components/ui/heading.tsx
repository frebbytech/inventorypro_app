import { ReactNode } from "react";

interface HeadingProps {
  title: string;
  description: string;
  button?: ReactNode | null;
}

export const Heading: React.FC<HeadingProps> = ({
  title,
  description,
  button = null,
}) => {
  return (
    <div className="flex-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-center py-2 mt-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {button}
    </div>
  );
};
