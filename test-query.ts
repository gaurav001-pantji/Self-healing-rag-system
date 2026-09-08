async function run() {
  try {
    const res = await fetch("http://localhost:3001/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "whats in this pdf" })
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Data:", data);
  } catch(e) {
    console.error(e);
  }
}
run();
