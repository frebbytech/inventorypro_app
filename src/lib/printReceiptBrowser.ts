// lib/printReceiptBrowser.ts
export function printReceiptInBrowser(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const cleanup = () => {
      // small delay before removing so the print dialog has fully handed off
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 500);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) throw new Error("Could not access iframe window");

        win.focus();
        win.print();
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Failed to load receipt into iframe"));
    };

    // srcdoc handles the full HTML document string cleanly
    iframe.srcdoc = html;
  });
}