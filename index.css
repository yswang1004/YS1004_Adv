type AnyWindow = Window & { $3Dmol?: any };

export async function ensure3DMolLoaded(): Promise<any> {
  const w = window as AnyWindow;
  if (w.$3Dmol) return w.$3Dmol;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-3dmol="1"]');
    if (existing) {
      const t = setInterval(() => {
        if (w.$3Dmol) {
          clearInterval(t);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(t);
        w.$3Dmol ? resolve() : reject(new Error("3Dmol load timeout"));
      }, 10_000);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/3dmol/build/3Dmol-min.js";
    script.async = true;
    script.defer = true;
    script.setAttribute("data-3dmol", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load 3Dmol"));
    document.head.appendChild(script);
  });

  if (!w.$3Dmol) throw new Error("3Dmol not available after load");
  return w.$3Dmol;
}
