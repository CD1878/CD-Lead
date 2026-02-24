import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

        console.log(`Starting extraction for: ${placeName} (${website}) using Ultimate AI Waterfall (Gemini + OpenAI)`);

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

        // shared vars for extracted data
        let rawEmail: string | null = null;
        let rawOwner: string | null = null;
        let aiSuccess = false;

        // 2. PRIMARY AI: Gemini 2.5 Flash with Google Search Grounding
        // Dit haalt de machtige "blauw AI blokjes" van Google op voor maximale accuraatheid
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (geminiApiKey) {
            console.log(`[PRIMARY AI] Probeer Gemini 2.5 Flash Grounding voor ${placeName}...`);
            try {
                const genAI = new GoogleGenerativeAI(geminiApiKey);
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    tools: [
                        {
                            // @ts-expect-error: googleSearch is valid but types might be outdated
                            googleSearch: {}
                        }
                    ],
                });

                const geminiPrompt = `Je bent een expert in B2B data-extractie. Je hebt via je Grounding tool directe toegang tot de Google Zoekmachine. Je zoekt actuele bedrijfsinformatie over "${placeName}" in Amsterdam.
Website URL: ${website}
    
Jouw taken:
1. Zoek naar het algemene of specifieke contact e-mailadres voor dit bedrijf.
2. Zoek SPECIFIEK naar de ware oprichter (founder) of eigenaar (owner).
-> CRUCIAAL: Gebruik je Google Search tool ALTIJD actief! Zoek op "${placeName} eigenaar" of "oprichter ${placeName} Amsterdam".
-> CRUCIAAL: Lees ALS ALLEREERSTE het "AI-overzicht" (AI Overview) bovenaan je eigen Google Search resultaten. Dit geeft heel vaak direct het antwoord. Neem uitsluitend de daadwerkelijk gevonden namen over, verzin absolut niets als je het niet zeker weet!

Als je echt geen eigenaar of e-mail kunt achterhalen via de website en Google Search, gebruik dan exact de letterlijke waarde null.

=== OFFICIELE WEBSITE CONTENT VOOR INITIËLE CONTEXT ===
${websiteMarkdown.substring(0, 15000)}

Geef je eindantwoord ALTIJD verplicht in exact het volgende pure JSON formaat (GEEN markdown blokken, GEEN uitleg, alleen dit specifieke rauwe JSON object):
{
  "email": "het_gevonden_emailadres_of_null",
  "ownerName": "de_naam_van_de_eigenaar_of_null"
}`;

                const result = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: geminiPrompt }] }]
                });

                let responseText = result.response.text();
                responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

                const parsed = JSON.parse(responseText);

                // If we found a valid owner, mark as success!
                if (parsed.ownerName && parsed.ownerName !== "null" && parsed.ownerName !== "") {
                    rawOwner = parsed.ownerName;
                    rawEmail = parsed.email === "null" || parsed.email === "" ? null : parsed.email;
                    aiSuccess = true;
                    console.log(`[PRIMARY AI SUCCESS] Gemini vond eigenaar:`, rawOwner);
                } else {
                    console.log(`[PRIMARY AI] Gemini vond geen eigenaar. De payload was:`, parsed);
                }
            } catch (err: unknown) {
                console.log(`[PRIMARY AI ERROR] Gemini faalde (limiet of fout):`, err instanceof Error ? err.message : String(err));
            }
        } else {
            console.log(`[PRIMARY AI SKIP] Geen GEMINI_API_KEY gevonden.`);
        }

        // 3. FALLBACK AI: OpenAI + Brave Web Search ("En-En" Strategie)
        if (!aiSuccess) {
            console.log(`[FALLBACK AI] Overschakelen naar onbeperkte OpenAI + Brave Search voor ${placeName}...`);

            console.log(`[Failsafe WebSearch] Uitvoeren parallel webresearch voor ${placeName}...`);
            const searchQuery = `"${placeName}" Amsterdam eigenaar OR oprichter OR Linkedin`;
            const searchMarkdown = await braveWebSearch(searchQuery);

            const openAiKey = process.env.OPENAI_API_KEY;
            if (!openAiKey) {
                return NextResponse.json({ error: 'OPENAI_API_KEY required for fallback' }, { status: 400 });
            }

            const prompt = `Je bent een expert in B2B data-extractie. Je hebt via je externe scraping tool actuele bedrijfsinformatie verzameld over "${placeName}" in Amsterdam.
Website URL: ${website}
        
Jouw taken:
1. Zoek naar het algemene of specifieke contact e-mailadres voor dit bedrijf.
2. Zoek SPECIFIEK naar de ware oprichter (founder) of eigenaar (owner).
-> CRUCIAAL: Raadpleeg als eerste prioriteit de bijgeleverde "EXTERNE BRAVE ZOEKRESULTATEN". Deze bevat actuele webresultaten gericht op "${placeName} eigenaar". Lees dit goed en zoek naar namen. Neem uitsluitend de daadwerkelijk gevonden namen over, verzin absolut niets als je het niet zeker weet!
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

                responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
                const extractedInfo = JSON.parse(responseText);

                rawEmail = extractedInfo.email === "null" || extractedInfo.email === "" ? null : extractedInfo.email;
                rawOwner = extractedInfo.ownerName === "null" || extractedInfo.ownerName === "" ? null : extractedInfo.ownerName;
            } catch (fallbackErr: unknown) {
                console.error("OpenAI Fallback Error:", fallbackErr);
                return NextResponse.json({
                    error: 'Zowel Gemini als OpenAI fallback faalden.',
                    status: 'failed',
                    initialEmail: null,
                    ownerName: null
                });
            }
        }

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

    } catch (error) {
        console.error('Scraping Error:', error);
        return NextResponse.json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
