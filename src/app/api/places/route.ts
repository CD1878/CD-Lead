import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow Vercel functions to run for up to 60s

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { query } = body;

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 });
        }

        // We strip leading numbers (e.g., "10 italian restaurants amsterdam" -> "italian restaurants amsterdam")
        // because numbers confuse the Google Places API into finding weird specific addresses in other cities.
        const cleanQuery = query.replace(/^\d+\s*/, '').trim();

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                // We need id, displayName, and websiteUri. Also address could be useful.
                'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress',
            },
            body: JSON.stringify({
                textQuery: cleanQuery,
                languageCode: 'nl',
                maxResultCount: 20,
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Google Places API Error:', errorData);
            return NextResponse.json({ error: 'Failed to fetch places' }, { status: response.status });
        }

        const data = await response.json();

        // Validate we have places
        if (!data.places || data.places.length === 0) {
            return NextResponse.json({ places: [] });
        }

        // Filter out places without a website, as we need a website to scrape
        let validPlaces = data.places.filter(
            (place: { websiteUri?: string, formattedAddress?: string }) => place.websiteUri && place.websiteUri.length > 0
        );

        // Smart City Filter: if the user explicitly typed a city, enforce it in the address
        const queryLower = query.toLowerCase();
        // A list of common large Dutch cities to check against
        const commonCities = ['amsterdam', 'rotterdam', 'utrecht', 'den haag', 'eindhoven', 'haarlem', 'groningen', 'breda', 'amersfoort', 'nijmegen', 'enschede', 'arnhem', 'zaandam', 'den bosch', 'zwolle', 'leiden', 'leeuwarden', 'maastricht', 'dordrecht', 'almere', 'tilburg'];
        const mentionedCities = commonCities.filter(city => queryLower.includes(city));

        console.log("---> SERVER: Cleaned Query:", cleanQuery, "Mentioned:", mentionedCities);
        console.log("---> SERVER: Pre-filter places:", validPlaces.length);

        if (mentionedCities.length > 0) {
            validPlaces = validPlaces.filter((place: { formattedAddress?: string }) => {
                if (!place.formattedAddress) return true;
                const addressLower = place.formattedAddress.toLowerCase();
                const keeps = mentionedCities.some(city => addressLower.includes(city));
                if (!keeps) console.log("Dropped due to missing city in address:", addressLower);
                return keeps;
            });
            console.log("Post-filter places count:", validPlaces.length);
        }

        // Limit to 10 max leads per search to save costs/time
        validPlaces = validPlaces.slice(0, 10);

        return NextResponse.json({ places: validPlaces });
    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
