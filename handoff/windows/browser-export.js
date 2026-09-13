(async () => {
  if (location.origin !== "http://127.0.0.1:4329") throw new Error("请在正在使用的 http://127.0.0.1:4329 DiaStage 页面中导出；当前页面是 " + location.href);
  const names = ["diastage-scene-journal", "diastage-rehearsal-feedback"];
  const request = (req) =>
    new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  const openExisting = (name) =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      let missing = false;
      req.onupgradeneeded = () => {
        missing = true;
        req.transaction.abort();
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(missing ? new Error(`Database does not exist: ${name}`) : req.error);
    });

  const databases = {};
  for (const name of names) {
    const db = await openExisting(name);
    const stores = {};
    for (const storeName of db.objectStoreNames) {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const [keys, values] = await Promise.all([
        request(store.getAllKeys()),
        request(store.getAll()),
      ]);
      stores[storeName] = keys.map((key, index) => ({
        key,
        value: values[index],
      }));
    }
    databases[name] = { version: db.version, stores };
    db.close();
  }

  const localStorageData = Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter(Boolean)
      .map((key) => [key, localStorage.getItem(key)]),
  );
  const payload = {
    format: "diastage-browser-backup-v1",
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    href: location.href,
    databases,
    localStorage: localStorageData,
  };
  const json = JSON.stringify(payload, (_, value) =>
    typeof value === "bigint" ? { type: "BigInt", value: String(value) } : value,
  2);
  const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `diastage-chrome-backup-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

  console.table(Object.fromEntries(Object.entries(databases).map(([name, db]) => [
    name,
    db.missing ? "MISSING" : Object.values(db.stores).reduce((sum, rows) => sum + rows.length, 0),
  ])));
  console.log("DiaStage browser backup downloaded:", link.download);
})().catch((error) => console.error("DiaStage browser backup failed", error));

