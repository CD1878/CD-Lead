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

export async function POST(request: Request) {
    try {
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            console.error("Geen GEMINI_API_KEY gevonden in de omgevingsvariabelen.");
            return NextResponse.json({
                error: 'GEMINI_API_KEY ontbreekt in .env.local. Voeg deze toe om Google Search Grounding te gebruiken.',
                status: 'failed',
                initialEmail: null,
                ownerName: null
            }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey);

        const { website, placeName } = await request.json();

        if (!website || !placeName) {
            return NextResponse.json({ error: 'Website and placeName are required' }, { status: 400 });
        }

        console.log(`Starting extraction for: ${placeName} (${website}) using Gemini w/ Google Search Grounding`);

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

        // 2. Gebruik Gemini met Google Search Grounding ingeschakeld!
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [
                {
                    // @ts-ignore: googleSearch typing missing in some older @google/generative-ai versions
                    googleSearch: {} // Dit vertelt Gemini om direct op Google.com te zoeken
                }
            ],
        });

        const prompt = `Je bent een expert in B2B data-extractie. Je hebt directe toegang tot de Google Zoekmachine. Zoek grondig op het web naar HUIDIGE informatie over het bedrijf/de bakkerij/het restaurant "${placeName}" in Amsterdam.
Website URL: ${website}
    
Jouw taken:
1. Zoek naar het algemene of specifieke contact e-mailadres voor dit bedrijf. Gebruik je Google Search tool specifiek als je het niet direct uit de website content haalt.
2. Zoek SPECIFIEK via Google Search naar artikelen, interviews, KVK gegevens, of eigen website over de HUIDIGE ware eigenaar (owner) of oprichter (founder). 
-> Negeer namen van willekeurige bakkers, bedrijfsleiders, stagiaires, of PR-medewerkers. 
-> Je MOET de zoekterm "eigenaar ${placeName} Amsterdam" of "oprichter ${placeName} Amsterdam" gebruiken en kijken wie er in de Google-resultaten bovenaan staat (Bv. "Henk Jongejans" is duidelijk de oprichter van Bakhuys. "Maarten Langeslag" is de oprichter van Fort Negen).

Als je geen specifieke eigenaar of geen e-mailadres kunt vinden, is dat oké. Laat de property dan he-le-maal weg door exact de waarde \`null\` neer te zetten (niet als string).

=== OFFICIELE WEBSITE CONTENT VOOR INITIËLE CONTEXT ===
${websiteMarkdown.substring(0, 15000)}

Geef je eindantwoord ALTIJD verplicht in precies het volgende pure JSON formaat (GEEN markdown blokken rondom, GEEN uitleg, puur en alleen het rauwe JSON object).
{
  "email": "het_gevonden_emailadres_of_null",
  "ownerName": "de_naam_van_de_eigenaar_of_null"
}`;

        console.log(`[DEBUG-PROMPT] Vraagt Gemini om Google Search in te zetten voor ${placeName}...`);

        try {
            // Gemini 2.0 en 2.5 ondersteunen responseMimeType in generationConfig of JSON format
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                }
            });

            const responseText = result.response.text();
            console.log(`[DEBUG-GEMINI] Raw Gemini Search Response for ${placeName}:`, responseText);

            const extractedInfo = JSON.parse(responseText.trim());

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
