import { NextResponse } from 'next/server';

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

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                // We need id, displayName, and websiteUri. Also address could be useful.
                'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress',
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: 'nl',
                maxResultCount: 10,
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
        const validPlaces = data.places.filter(
            (place: { websiteUri?: string }) => place.websiteUri && place.websiteUri.length > 0
        );

        return NextResponse.json({ places: validPlaces });
    } catch (error) {
        console.error('API Route Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
