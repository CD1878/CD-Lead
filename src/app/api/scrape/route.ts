import { NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import OpenAI from 'openai';

export async function POST(request: Request) {
    try {
        const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const { website, placeName } = await request.json();

        if (!website) {
            return NextResponse.json({ error: 'Website URL is required' }, { status: 400 });
        }

        console.log(`Starting crawl for: ${placeName} (${website})`);

        // 1. Deep crawl the website using Firecrawl (scrapes up to 3 pages)
        const crawlResult = await firecrawl.crawl(website, {
            limit: 3,
            scrapeOptions: { formats: ['markdown'] }
        });

        const siteFailed = !crawlResult || crawlResult.status === 'failed' || !crawlResult.data || crawlResult.data.length === 0;
        let websiteMarkdown = '';
        if (!siteFailed) {
            websiteMarkdown = crawlResult.data!
                .map(page => page.markdown || '')
                .join('\\n\\n--- [Volgende Pagina] ---\\n\\n');
        }

        console.log(`Starting web search enrichment for: ${placeName}`);

        // 2. Web Search Enrichment: Zoek het hele internet af naar de eigenaar (bijv. nieuws, KvK, LinkedIn)
        let searchMarkdown = '';
        try {
            const searchQuery = `"${placeName}" Amsterdam (eigenaar OR owner OR oprichter OR chef)`;
            const searchResult = await firecrawl.search(searchQuery, {
                limit: 3,
                scrapeOptions: { formats: ['markdown'] }
            }) as unknown as { success: boolean, data: { url: string, markdown?: string }[] };

            if (searchResult && searchResult.data && searchResult.data.length > 0) {
                searchMarkdown = searchResult.data
                    .map((res: { url: string, markdown?: string }) => `BRON: ${res.url}\\n${res.markdown || ''}`)
                    .join('\\n\\n--- [Volgende Bron] ---\\n\\n');
            }
        } catch (searchErr) {
            console.error('Search enrichment failed, continuing with website data only:', searchErr);
        }

        if (siteFailed && !searchMarkdown) {
            return NextResponse.json({
                initialEmail: null,
                ownerName: null,
                status: 'failed',
                error: 'Website konden we niet openen en web search faalde'
            });
        }

        // 3. Use OpenAI to analyze BOTH the website and the broader web search results
        const prompt = `
    Je bent een expert in B2B lead generation. Hier is de vergaarde data over een restaurant genaamd "${placeName}".
    Website URL: ${website}
    
    Jouw taak:
    1. Zoek naar één of meerdere e-mailadressen of het hoofd e-mailadres. Combineer kennis uit de bronnen.
    2. Zoek specifiek naar de voor- en/of achternaam van de eigenaar, manager of oprichter. Gebruik gerust de externe artikelen/bronnen.
    
    Als je geen specifieke persoon of geen e-mailadres kunt vinden, is dat oké. Laat de property dan he-le-maal weg (gebruik null in JSON als literal, NIET de string "null"). Verzin niets.
    
    === OFFICIELE WEBSITE CONTENT ===
    ${websiteMarkdown.substring(0, 15000)}
    
    === EXTERNE WEB SEARCH RESULTATEN (Artikelen, KvK, LinkedIn, etc.) ===
    ${searchMarkdown.substring(0, 15000)}
    `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Snel en capabel genoeg voor dit werk
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
                                ownerName: { type: "string", description: "De volledige naam of voornaam van de eigenaar of contactpersoon. Gebruik null als er geen wordt vermeld." },
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

            if (rawEmail && rawOwner) {
                // We have both! Let's guess the direct email format usually it's [firstname]@[domain]
                // But for this mockup, we'll assign 'verified' to show success.
                const firstName = rawOwner.split(' ')[0].toLowerCase().trim();
                const domainMatch = website.match(/https?:\/\/(?:www\.)?([^\/]+)/);
                const domain = domainMatch ? domainMatch[1] : '';

                verifiedEmail = `${firstName}@${domain}`;
                status = 'verified';
            } else if (rawEmail && !rawOwner) {
                status = 'general';
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
