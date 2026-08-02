# Ellie business-data feed contract

Ellie owns the research jobs, organization database, evidence model, deduplication,
scoring, prospect review, verification states, lists, exports, and outreach handoff.
The raw business feed is replaceable so Ellie is not locked to a prospecting vendor.

## Configuration

Set these backend environment values only when a production feed is available:

- `ELLIE_BUSINESS_DATA_API_URL`: HTTPS endpoint accepting Ellie's search contract.
- `ELLIE_BUSINESS_DATA_API_KEY`: optional bearer token for that endpoint.
- `MARKET_RESEARCH_AI_ENABLED=false`: optional switch to force rules-only query planning.
- `MARKET_RESEARCH_OPENAI_MODEL`: optional planning model override.

The endpoint receives:

```json
{
  "plan": {
    "name": "Hair Salons in San Francisco",
    "criteria": {
      "industries": ["Hair Salons"],
      "keywords": ["hair salons", "2+ locations"],
      "locations": ["San Francisco"],
      "minimumLocations": 2
    }
  },
  "cursor": null,
  "limit": 250
}
```

The endpoint returns `results`, an optional `nextCursor`, and an optional `total`.
Every field that affects ranking should include a public or licensed evidence URL.

```json
{
  "results": [{
    "id": "source-record-id",
    "name": "Salon Luxe",
    "domain": "salonluxe.example",
    "website": "https://salonluxe.example",
    "industry": "Hair Salon",
    "location": "San Francisco, CA",
    "locationCount": 3,
    "employeeCount": 24,
    "evidence": [{
      "sourceType": "official_website",
      "sourceUrl": "https://salonluxe.example/locations",
      "field": "locationCount",
      "observedValue": "3",
      "observedAt": "2026-08-02T00:00:00.000Z"
    }],
    "people": [{
      "name": "Sarah Chen",
      "title": "Owner",
      "email": "sarah@salonluxe.example",
      "evidenceUrl": "https://salonluxe.example/about"
    }]
  }],
  "nextCursor": null,
  "total": 1
}
```

An email returned by the feed enters Ellie as `published_unverified`. It cannot be
used as a verified outreach address until the separate verification workflow passes.

Do not configure the public OpenStreetMap Nominatim endpoint as a bulk source.
Production open-data operation should use downloaded extracts and Ellie-controlled
indexing, or a licensed hosted service whose terms permit storage and lead research.
