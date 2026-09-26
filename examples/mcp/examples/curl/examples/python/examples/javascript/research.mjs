const token = process.env.APIFY_TOKEN;

if (!token) {
  console.error("Error: APIFY_TOKEN is not set.");
  process.exit(1);
}

const url =
  "https://api.apify.com/v2/actors/" +
  "industrial_platform~research-brief-agent/" +
  "run-sync-get-dataset-items?clean=true&format=json";

const input = {
  research_question:
    "Compare HubSpot CRM, Pipedrive, and Zoho CRM for a five-person small business.",

  context:
    "The business needs predictable pricing, automation, integrations, and straightforward administration.",

  requirements:
    "Use current authoritative sources. Include a comparison table, cite sources, identify pricing caveats, and state unresolved facts.",
};

const response = await fetch(url, {
  method: "POST",

  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  body: JSON.stringify(input),
});

if (!response.ok) {
  const body = await response.text();

  console.error(
    `Apify API returned HTTP ${response.status}:\n${body}`,
  );

  process.exit(1);
}

const result = await response.json();

console.log(JSON.stringify(result, null, 2));
