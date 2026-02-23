async function duckDuckGoSearch(query) {
    try {
        const formData = new URLSearchParams({ q: query, kl: 'nl-nl' });
        const res = await fetch('https://lite.duckduckgo.com/lite/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            body: formData.toString()
        });
        if (!res.ok) { console.log("DDG Not OK:", res.status); return ''; }
        const html = await res.text();
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 15000);
    } catch (e) {
        console.log("DDG Error", e);
        return '';
    }
}
(async () => {
    const res = await duckDuckGoSearch('"Fort Negen" Amsterdam eigenaar oprichter Linkedin');
    console.log(res);
})();
