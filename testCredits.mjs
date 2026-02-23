const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

const firecrawlFetch = async (endpoint, bodyStr) => {
    const res = await fetch('https://api.firecrawl.dev/v1/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + FIRECRAWL_API_KEY },
        body: bodyStr
    });
    const data = await res.json();
    return { status: res.status, data };
};

(async () => {
    const res = await firecrawlFetch('scrape', JSON.stringify({ url: 'https://www.fortnegen.nl' }));
    console.log(JSON.stringify(res, null, 2));
})();
