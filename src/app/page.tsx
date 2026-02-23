"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ResultsTable, Lead } from "@/components/ResultsTable";

// Demo data removed

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const handleSearch = async (query: string) => {
    // Reset state
    setLeads([]);

    try {
      // 1. Fetch real places from our API route
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) throw new Error('Failed to fetch places');

      const data = await res.json();
      const places = data.places || [];

      // 2. Map Google Places to our Lead interface and show them as "crawling"
      const newLeads: Lead[] = places.map((place: { id: string, displayName?: { text: string }, websiteUri?: string }) => ({
        id: place.id,
        name: place.displayName?.text || 'Onbekend',
        website: place.websiteUri || 'Geen website',
        initialEmail: null,
        ownerName: null,
        verifiedEmail: null,
        status: 'crawling'
      }));

      setLeads(newLeads);

      // 3. Trigger the scraper sequentially to respect Firecrawl rate limits (Free tier: max 1-2 concurrent crawls)
      for (const lead of newLeads) {
        if (lead.website === 'Geen website') {
          setLeads(current => current.map(l => l.id === lead.id ? { ...l, status: 'failed' } : l));
          continue;
        }

        try {
          const scrapeRes = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ website: lead.website, placeName: lead.name }),
          });

          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json();

            setLeads(current => current.map(l => {
              if (l.id === lead.id) {
                return {
                  ...l,
                  initialEmail: scrapeData.initialEmail,
                  ownerName: scrapeData.ownerName,
                  verifiedEmail: scrapeData.verifiedEmail,
                  status: scrapeData.status || 'failed'
                };
              }
              return l;
            }));
          } else {
            setLeads(current => current.map(l => l.id === lead.id ? { ...l, status: 'failed' } : l));
          }
        } catch {
          setLeads(current => current.map(l => l.id === lead.id ? { ...l, status: 'failed' } : l));
        }

        // Prevent Firecrawl Free Tier Rate Limit (429 Throttle)
        // Firecrawl allows 10-20 requests/min. 2.5s sleep = 24 requests/min pacing.
        await new Promise(resolve => setTimeout(resolve, 2500));
      }

    } catch (error) {
      console.error('Error in search:', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

      <main className="flex flex-col items-center w-full flex-1 px-4 z-10 pt-24 pb-20">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-block mb-4 md:mb-6 px-3 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 backdrop-blur-md text-[10px] md:text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Chef Digital Lead Engine
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4 md:mb-6 bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent px-2">
            Vind de perfecte <br className="hidden sm:block" /> horeca leads.
          </h1>
          <p className="text-zinc-400 text-base md:text-lg max-w-2xl mx-auto px-4">
            Vul een zoekopdracht in en onze AI vindt automatisch de contactgegevens en verifieert e-mailadressen van beslissers.
          </p>
        </div>

        <SearchBar onSearch={handleSearch} />

        <ResultsTable leads={leads} />
      </main>
    </div>
  );
}
