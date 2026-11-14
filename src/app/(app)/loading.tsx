export default function Loading() {
  return (
    <div className="container h-svh w-svw bg-background flex items-center justify-center">
      <div className="loader">
        <div className="loader__bar bg-primary"></div>
        <div className="loader__bar bg-primary"></div>
        <div className="loader__bar bg-primary"></div>
        <div className="loader__bar bg-primary"></div>
        <div className="loader__bar bg-primary"></div>
        <div className="loader__ball bg-accent"></div>
      </div>
    </div>
  );
}
