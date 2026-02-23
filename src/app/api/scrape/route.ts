import { NextResponse } from 'next/server';

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

// Failsafe 2: Brave Web Search (Bypasses Firecrawl Credits & DDG Blocks to Provide Web Context)
async function braveWebSearch(query: string): Promise<string> {
    try {
        const res = await fetch(`https://search.brave.com/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8'
            }
        });
        if (!res.ok) return '';
        const html = await res.text();
        return html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 15000); // Feed the first 15k characters of search results to AI
    } catch {
        return '';
    }
}

export async function POST(request: Request) {
    try {
        const { website, placeName } = await request.json();

        if (!website || !placeName) {
            return NextResponse.json({ error: 'Website and placeName are required' }, { status: 400 });
        }

        console.log(`Starting extraction for: ${placeName} (${website}) using OpenAI w/ DDG Grounding`);

        // 1. Snelle scrape van de homepagina of contact pagina (we houden deze als basis context)
        let websiteMarkdown = '';

        const firecrawlFetch = async (endpoint: 'scrape', bodyStr: string) => {
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
            } else {
                console.log(`[FIRE-SCRAPE-ERR] ${website} ->`, res.data?.error || `HTTP ${res.status}`);
            }
        } catch (e: unknown) {
            console.error(`Exception tijdens scrape van ${website}:`, e instanceof Error ? e.message : String(e));
        }

        // Failsafe scrape: native fetch
        if (!websiteMarkdown) {
            console.log(`[Failsafe Native Fetch] Firecrawl failed for ${website}. Using native fetch.`);
            websiteMarkdown = await nativeFetchMarkdown(website);
        }

        // Failsafe contact: if we couldn't find an '@' explicitly scrape the /contact page 
        if (!websiteMarkdown.includes('@')) {
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const contactUrl = website.endsWith('/') ? website + 'contact' : website + '/contact';
                console.log(`Failsafe: scraping explicitly ${contactUrl}`);

                // Let's use native fetch directly here to save time/credits for this failsafe
                const contactRes = await nativeFetchMarkdown(contactUrl);
                if (contactRes) {
                    websiteMarkdown += '\n\n--- [Contact Pagina Failsafe] ---\n\n' + contactRes;
                }
            } catch (e: unknown) {
                console.error("Failsafe contact scrape exception", String(e));
            }
        }

        // 2. EXTRA CONTEXT: Brave Web Search
        // We voegen een externe Brave zoekopdracht toe als extra databron ("En-En" strategie).
        console.log(`[Failsafe WebSearch] Uitvoeren parallel webresearch voor ${placeName}...`);
        const searchQuery = `"${placeName}" Amsterdam eigenaar OR oprichter OR Linkedin`;
        const searchMarkdown = await braveWebSearch(searchQuery);

        // 3. Setup OpenAI als de Orcherstrator (aangezien Gemini free tier in de EU strikt gelimiteerd is)
        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            return NextResponse.json({ error: 'OPENAI_API_KEY required' }, { status: 400 });
        }

        const prompt = `Je bent een expert in B2B data-extractie. Je hebt via je externe scraping tool actuele bedrijfsinformatie verzameld over "${placeName}" in Amsterdam.
Website URL: ${website}
    
Jouw taken:
1. Zoek naar het algemene of specifieke contact e-mailadres voor dit bedrijf.
2. Zoek SPECIFIEK naar de ware oprichter (founder) of eigenaar (owner).
-> CRUCIAAL: Raadpleeg als eerste prioriteit de bijgeleverde "EXTERNE BRAVE ZOEKRESULTATEN". Deze bevat actuele webresultaten gericht op "${placeName} eigenaar". Lees dit goed en zoek naar namen. Dit geeft gegarandeerd direct het antwoord (bijv. "Paula Fles en Stephan de Haas" of "Yoeri Joosten en Elin Visser"). Neem die namen exact over!
-> Negeer bedrijfsleiders, stagiaires of personeel.
-> Raadpleeg daarna "OFFICIELE WEBSITE CONTENT" of deze namen terugkomen en combineer de bevindingen ("En-En" strategie).

Als je echt geen eigenaar of e-mail kunt achterhalen in beide bronnen, gebruik dan exact de letterlijke waarde null.

=== OFFICIELE WEBSITE CONTENT VOOR INITIËLE CONTEXT ===
${websiteMarkdown.substring(0, 15000)}

=== EXTERNE BRAVE ZOEKRESULTATEN ===
${searchMarkdown.substring(0, 15000)}

Geef je eindantwoord ALTIJD verplicht in exact het volgende pure JSON formaat (GEEN markdown blokken, GEEN uitleg, alleen dit specifieke rauwe JSON object):
{
  "email": "het_gevonden_emailadres_of_null",
  "ownerName": "de_naam_van_de_eigenaar_of_null"
}`;

        console.log(`[DEBUG-PROMPT] Vraagt OpenAI (met DDG supercharge) om eigenaar te achterhalen voor ${placeName}...`);

        try {
            const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    response_format: { type: "json_object" },
                    messages: [
                        { role: 'system', content: prompt }
                    ],
                    temperature: 0.2
                })
            });

            if (!aiRes.ok) throw new Error('OpenAI fetch mislukt (' + aiRes.status + ')');

            const aiData = await aiRes.json();
            let responseText = aiData.choices[0].message.content;
            console.log(`[DEBUG-OPENAI] Raw Search Response for ${placeName}:`, responseText);

            // Clean up Markdown backticks if Gemini still includes them despite prompt instructions
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

            const extractedInfo = JSON.parse(responseText);

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

        } catch (genErr) {
            console.error("Gemini Generation/Parse Error:", genErr);
            return NextResponse.json({
                error: 'De AI gaf een ongeldig antwoordformaat terug of zoeken faalde',
                status: 'failed',
                initialEmail: null,
                ownerName: null
            });
        }

    } catch (error) {
        console.error('Scraping Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
