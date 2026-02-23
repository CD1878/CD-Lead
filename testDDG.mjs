async function duckDuckGoSearch(query) {
    console.log("Fetching DDG for:", query);
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        console.log("Status:", res.status);
        const html = await res.text();
        console.log("Bytes:", html.length);
        if (html.includes("Maarten")) {
            console.log("MAARTEN FOUND!");
        }
    } catch (e) {
        console.log("Error:", e);
    }
}
duckDuckGoSearch('Fort Negen Amsterdam eigenaar');
