import React from "react";

function loading() {
  return (
    <div className="container h-svh w-svw flex items-center justify-center">
      <div className="loader">
    
        <div className="loader__bar dark:bg-primary"></div>
        <div className="loader__bar dark:bg-primary"></div>
        <div className="loader__bar dark:bg-primary"></div>
        <div className="loader__bar dark:bg-primary"></div>
        <div className="loader__bar dark:bg-primary"></div>
        <div className="loader__ball dark:bg-accent"></div>
      </div>
      
    </div>
  );
}

export default loading;
