"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();

  const handleGoBack = () => {
    router.back();
  };

  const handleGoHome = () => {
    router.push("/");
  };


  return (
    <div className="min-h-screen w-full bg-background bg-grid-pattern dark:bg-grid-pattern-dark flex items-center justify-center p-4 transition-colors duration-300">
      <div className="relative flex flex-col items-center justify-center text-center max-w-2xl w-full">
        
        {/* 1. Dynamic Decorative Glow (Calmed down for light, vibrant for dark) */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 dark:from-primary/20 via-primary/0 to-transparent rounded-full blur-3xl opacity-70 dark:opacity-100 transition-opacity" />

        {/* 2. Optimized 404 Number (Fades perfectly into deep backgrounds) */}
        <span className="bg-gradient-to-b from-foreground via-foreground/90 to-muted/20 dark:to-transparent bg-clip-text text-[8rem] sm:text-[10rem] font-extrabold leading-none text-transparent select-none tracking-tighter">
          404
        </span>

        {/* 3. Typography Content */}
        <h2 className="font-heading mt-6 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Something&apos;s missing
        </h2>

        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-md balance">
          Sorry, the page you are looking for doesn&apos;t exist or has been moved.
        </p>

        {/* 4. Responsive Action Buttons Trigger */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto px-4">
          <Button 
            onClick={handleGoBack} 
            variant="default" 
            size="lg" 
            className="w-full sm:w-auto shadow-sm shadow-primary/10 dark:shadow-primary/5 active:scale-[0.98] transition-all"
          >
            Go back
          </Button>
          <Button 
            onClick={handleGoHome} 
            variant="outline" 
            size="lg" 
            className="w-full sm:w-auto bg-background/50 dark:bg-background/20 backdrop-blur-sm active:scale-[0.98] transition-all"
          >
            Back to Home
          </Button>
        </div>

      </div>
    </div>
  );
}
