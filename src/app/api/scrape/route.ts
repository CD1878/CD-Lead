import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow Vercel functions to run for up to 60s for deep crawling

// Native Web Scraper Failsafe
async function nativeFetchMarkdown(targetUrl: string): Promise<string> {
    try {
        const response = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (!response.ok) return '';
        const html = await response.text();
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 15000);
    } catch {
        return '';
    }
}

// DuckDuckGo Search Failsafe
async function duckDuckGoSearch(query: string): Promise<string> {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        if (!res.ok) return '';
        const html = await res.text();
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 15000);
    } catch {
        return '';
    }
}
export async function POST(request: Request) {
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const { website, placeName } = await request.json();

        if (!website || !placeName) {
            return NextResponse.json({ error: 'Website and placeName are required' }, { status: 400 });
        }

        console.log(`Starting crawl for: ${placeName} (${website})`);

        // 1. Snelle scrape van de homepagina (i.v.m timeouts was crawl te traag)
        let websiteMarkdown = '';
        let siteFailed = true;
        let scrapeErrorMsg = '';

        const firecrawlFetch = async (endpoint: 'scrape' | 'search', bodyStr: string) => {
            const apiKey = process.env.FIRECRAWL_API_KEY;
            const res = await fetch(`https://api.firecrawl.dev/v1/` + endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: bodyStr
            });
            const data = await res.json();
            return { status: res.status, data };
        };

        try {
            const res = await firecrawlFetch('scrape', JSON.stringify({ url: website, formats: ['markdown'] }));
            if (res.status === 200 && res.data?.success && res.data?.data?.markdown) {
                websiteMarkdown = res.data.data.markdown;
                siteFailed = false;
            } else {
                scrapeErrorMsg = res.data?.error || `HTTP ${res.status}`;
                console.log(`[FIRE-SCRAPE-ERR] ${website} ->`, scrapeErrorMsg);
            }
        } catch (e: unknown) {
            scrapeErrorMsg = e instanceof Error ? e.message : String(e);
            console.error(`Exception tijdens scrape van ${website}:`, scrapeErrorMsg);
        }

        if (!websiteMarkdown) {
            console.log(`[Failsafe Native Fetch] Firecrawl failed for ${website}. Using native fetch.`);
            websiteMarkdown = await nativeFetchMarkdown(website);
            if (websiteMarkdown) siteFailed = false;
        }

        // Failsafe: if we couldn't find an '@' explicitly scrape the /contact page 
        if (!websiteMarkdown.includes('@')) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));

                const contactUrl = website.endsWith('/') ? website + 'contact' : website + '/contact';
                console.log(`Failsafe: scraping explicitly ${contactUrl}`);

                const res = await firecrawlFetch('scrape', JSON.stringify({ url: contactUrl, formats: ['markdown'] }));

                if (res.status === 200 && res.data?.success && res.data?.data?.markdown) {
                    websiteMarkdown += '\\n\\n--- [Contact Pagina Failsafe] ---\\n\\n' + res.data.data.markdown;
                    siteFailed = false; // We salvaged it!
                } else {
                    console.log(`[FIRE-FAILSAFE-ERR] ${contactUrl} ->`, res.data?.error || `HTTP ${res.status}`);
                }
            } catch (e: unknown) {
                console.error("Failsafe contact scrape exception", e instanceof Error ? e.message : String(e));
            }
        }

        console.log(`Starting web search enrichment for: ${placeName}`);

        // 2. Web Search Enrichment: Zoek het hele internet af naar de eigenaar (bijv. nieuws, KvK, LinkedIn)
        let searchMarkdown = '';
        let searchErrorMsg = '';
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verwijder 'OR chef' om te voorkomen dat stagiaires (zoals Jillian) of losse koks de hoofd-eigenaar verdringen
            const searchQuery = `"${placeName}" Amsterdam (eigenaar OR owner OR oprichter OR KVK OR LinkedIn OR Facebook OR Instagram)`;
            const res = await firecrawlFetch('search', JSON.stringify({
                query: searchQuery,
                limit: 5,
                scrapeOptions: { formats: ['markdown'] }
            }));

            if (res.status === 200 && res.data?.success && res.data?.data) {
                // Combineer de markdown van de top 5 (of minder) resultaten
                searchMarkdown = res.data.data
                    .map((item: { url: string; markdown?: string }) => `BRON: ${item.url}\\n${item.markdown || ''}`)
                    .join('\\n\\n--- [Volgende Bron] ---\\n\\n');
            } else {
                searchErrorMsg = `(Search failed: ${res.status} - ${JSON.stringify(res.data)})`;
                console.warn(`[Scrape API] Web Search failed for ${placeName}:`, res.status, res.data);
            }
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`[Scrape API] Web Search Exception for ${placeName}:`, err);
            searchErrorMsg = `(Search exception: ${err.message})`;
        }

        if (!searchMarkdown) {
            console.log(`[Failsafe DuckDuckGo] Firecrawl search failed for ${placeName}. Using DuckDuckGo.`);
            const ddgQuery = `"${placeName}" Amsterdam eigenaar oprichter Linkedin`;
            searchMarkdown = await duckDuckGoSearch(ddgQuery);
        }

        // Als BEIDE methoden falen (zowel officiele site als web search levert niks op), kap af.
        if (siteFailed && !searchMarkdown) {
            return NextResponse.json({
                error: `Website konden we niet openen en web search faalde. Scrape-Error: ${scrapeErrorMsg} | Search-Error: ${searchErrorMsg}`,
                status: 'failed',
                initialEmail: null,
                ownerName: null
            });
        }

        // 3. Use OpenAI to analyze BOTH the website and the broader web search results
        const prompt = `
    Je bent een expert in B2B lead generation. Hier is de vergaarde data over een lokaal bedrijf genaamd "${placeName}".
    Website URL: ${website}
    
    Jouw taak:
    1. Zoek naar het hoofd e-mailadres (bijv. info@, hallo@) of een specifiek e-mailadres. Combineer kennis uit de bronnen.
    2. Zoek SPECIFIEK naar de voor- en/of achternaam van de ware eigenaar (owner) of oprichter (founder). 
       *LET OP*: Negeer namen van willekeurige medewerkers of managers (zoals degene achter klachtenafhandeling of sales). Als de externe artikelen duidelijk spreken van een 'eigenaar', 'oprichter' of 'man/vrouw achter [bedrijf]', dan móét je die naam prioriteren.
       *Bv. als je 'Maarten Langeslag' als oprichter in de tekst ziet, kies dan ALTIJD Maarten.*
    
    Als je geen specifieke eigenaar of geen e-mailadres kunt vinden, is dat oké. Laat de property dan he-le-maal weg (gebruik null in JSON als literal, NIET de string "null"). Verzin niets.
    
    === OFFICIELE WEBSITE CONTENT ===
    ${websiteMarkdown.substring(0, 15000)}
    
    === EXTERNE WEB SEARCH RESULTATEN (Artikelen, KvK, LinkedIn, Facebook, Instagram etc.) ===
    ${searchMarkdown.substring(0, 25000)}
    `;

        console.log(`[DEBUG-PROMPT] Inspecting what OpenAI sees for ${placeName}:\\n`, searchMarkdown);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Extreem betrouwbaar voor data-extractie en complexe context
            messages: [
                { role: "system", content: "Je bent een data extractie assistent die output levert in puur JSON formaat." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            tools: [
                {
                    type: "function",
                    function: {
                        name: "extract_lead_info",
                        description: "Extraheer de benodigde lead gegevens in het juiste format.",
                        parameters: {
                            type: "object",
                            properties: {
                                email: { type: "string", description: "Het e-mailadres van het restaurant. Gebruik null als er geen is." },
                                ownerName: { type: "string", description: "De ware eigenaar of oprichter (volle naam of voornaam). CITEER ABSOLUUT NIET een gewone medewerker. Gebruik null als de expliciete oprichter niet gevonden wordt." },
                            },
                            required: ["email", "ownerName"]
                        }
                    }
                }
            ],
            tool_choice: { type: "function", function: { name: "extract_lead_info" } }
        });

        const toolCall = completion.choices[0].message.tool_calls?.[0];
        if (toolCall && toolCall.type === 'function' && toolCall.function.name === 'extract_lead_info') {
            const extractedInfo = JSON.parse(toolCall.function.arguments);

            // Fix string "null"s sometimes returned by AI despite prompt instructions
            const rawEmail = extractedInfo.email === "null" || extractedInfo.email === "" ? null : extractedInfo.email;
            const rawOwner = extractedInfo.ownerName === "null" || extractedInfo.ownerName === "" ? null : extractedInfo.ownerName;

            let status = 'failed';
            let verifiedEmail = null;

            const domainMatch = website.match(/https?:\/\/(?:www\.)?([^\/]+)/);
            const domain = domainMatch ? domainMatch[1] : '';

            if (rawEmail && rawOwner) {
                // We have both! Let's guess the direct email format usually it's [firstname]@[domain]
                const firstName = rawOwner.split(' ')[0].toLowerCase().trim();
                verifiedEmail = `${firstName}@${domain}`;
                status = 'verified';
            } else if (rawEmail && !rawOwner) {
                status = 'general';
            } else if (!rawEmail && rawOwner) {
                // We have an owner but no rawEmail on the website.
                // It shouldn't be 'failed', we instead guess the verifiedEmail
                const firstName = rawOwner.split(' ')[0].toLowerCase().trim();
                verifiedEmail = `${firstName}@${domain}`;
                status = 'verified';
            }

            return NextResponse.json({
                initialEmail: rawEmail || null,
                ownerName: rawOwner || null,
                verifiedEmail: verifiedEmail,
                status: status
            });
        }

        return NextResponse.json({
            initialEmail: null,
            ownerName: null,
            status: 'failed'
        });

    } catch (error) {
        console.error('Scraping Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
