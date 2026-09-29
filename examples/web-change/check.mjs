const token = process.env.APIFY_TOKEN;

if (!token) {
  console.error('Error: APIFY_TOKEN is not set.');
  process.exit(1);
}

const url =
  'https://api.apify.com/v2/actors/' +
  'industrial_platform~web-change-intelligence/' +
  'run-sync-get-dataset-items?clean=true&format=json';

const input = {
  url: 'https://example.com/',
  include_current_text: true
};

const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  },
  body: JSON.stringify(input)
});

if (!response.ok) {
  console.error(`Apify API returned HTTP ${response.status}:\n${await response.text()}`);
  process.exit(1);
}

console.log(JSON.stringify(await response.json(), null, 2));
